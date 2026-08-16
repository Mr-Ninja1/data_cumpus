// The actual "generate or continue one chapter" pipeline, extracted out of
// the HTTP route so it can be called two ways:
//   1. Interactively, from /api/proposals/[id]/generate (a user is chatting).
//   2. From the autopilot tick (src/utils/autopilotEngine.ts), which keeps
//      calling this in the background until every required chapter for the
//      stage is actually complete, with no user in the loop.
// Keeping this as one shared function means autopilot can never drift from
// what a real interactive generation call does (spec injection, targeted
// fill for incomplete chapters, completeness verification, etc.).

import { supabaseServer } from './supabaseServerClient';
import { runModel } from './models';
import {
  buildChapterGenerationGuidance,
  buildLiteratureReviewContext,
  getChapterDiagramKeys,
  getChapterDiagramRequirements,
  hasValue,
  isInitialProposalReady,
  parseReferencesInput,
  parseRequiredInputs,
} from './proposalFlow';
import { generateDiagram, type GeneratedDiagram } from './diagramGeneration';
import { findDiagramMarkersInMarkdown } from './sectionSplice';
import { buildProposalStandardContext } from './proposalStandards';
import { buildZutProposalGuardrails, SCHOOL_PROFILE } from './schoolProfile';
import { loadWorkspaceSchoolSettings } from './workspaceSchoolSettings';
import { isAbortError, refundCredits } from './creditsRefund';
import {
  extractMarkdownSectionForChapter,
  getChapterSectionNumbers,
  getChapterSpecFragment,
  getFrontOrBackMatterFragment,
  getMissingSectionsGuidance,
  parseStructuredSpec,
  verifyChapterCompleteness,
} from './proposalSpec';
import { buildContextualGenerationPrompt, type ProposalContext } from './proposalContextMemory';

type DocumentSpecRow = {
  key: string;
  spec_md?: string | null;
  spec_json?: unknown;
  title?: string | null;
  description?: string | null;
};

type ProposalReference = {
  title?: string;
  author?: string;
  year?: string | number | null;
};

export type ProposalChapter = {
  chapter_key?: string;
  title?: string;
  content_md?: string;
  stage?: string;
  updated_at?: string;
  incomplete?: boolean;
  missing_sections?: string[];
};

function isCoverSection(sectionKey: string) {
  return ['cover', 'cover_page'].includes(sectionKey);
}

async function loadPreferredSpec() {
  if (!supabaseServer) return null;

  const schoolSettings = await loadWorkspaceSchoolSettings();
  const preferredKeys = [
    schoolSettings.default_proposal_spec_key,
    'zut-it-final-year-proposal',
    'zut-final-year-project-proposal',
    'default-proposal',
  ].filter(Boolean) as string[];

  const { data } = await supabaseServer
    .from('document_specs')
    .select('key, spec_md, spec_json, title, description')
    .in('key', preferredKeys);

  return preferredKeys.map((key) => (data || []).find((entry: DocumentSpecRow) => entry.key === key)).find(Boolean) || null;
}

export type GenerateChapterInput = {
  userId: string;
  userEmail?: string | null;
  projectId: string;
  sectionKey: string;
  chapterKey?: string;
  chapterTitle?: string;
  promptText?: string;
  stage?: string;
  creditsToSpend: number;
  attachments?: unknown[];
  specKey?: string | null;
  references?: string[];
  provider: string;
  model: string;
  signal?: AbortSignal;
  context?: ProposalContext;
};

export type GenerateChapterResult =
  | {
      ok: true;
      status: 'generated';
      responseText: string;
      incomplete: boolean;
      missingSections?: string[];
      nextChapterKey: string | null;
      balance: number;
      diagramWarnings?: string[];
    }
  | { ok: true; status: 'awaiting_input'; question: string; missingInputs: string[] }
  | { ok: false; error: string; httpStatus: number };

export async function generateOrContinueChapter(input: GenerateChapterInput): Promise<GenerateChapterResult> {
  if (!supabaseServer) return { ok: false, error: 'Server not configured', httpStatus: 500 };

  const { userId, projectId } = input;
  const sectionKey = input.sectionKey || 'chapter_1';
  const promptText = input.promptText || 'Draft a proposal section';
  const creditsToSpend = Number(input.creditsToSpend || 3);
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const provider = input.provider;
  const model = input.model;
  const signal = input.signal;

  const { data: walletData, error: walletError } = await supabaseServer
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError) return { ok: false, error: walletError.message, httpStatus: 500 };
  if ((walletData?.balance_credits ?? 0) < creditsToSpend) {
    return { ok: false, error: 'Insufficient credits', httpStatus: 402 };
  }

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (projectError || !project) return { ok: false, error: 'Proposal not found', httpStatus: 404 };

  const stage = input.stage || project?.metadata?.stage || 'initial_proposal';
  const chapterKey = input.chapterKey || sectionKey;

  const { data: section, error: sectionError } = await supabaseServer
    .from('proposal_sections')
    .select('*')
    .eq('project_id', projectId)
    .eq('section_key', sectionKey)
    .maybeSingle();

  if (sectionError) return { ok: false, error: sectionError.message, httpStatus: 500 };

  const { data: profile } =
    (await supabaseServer?.from('profiles').select('full_name,student_id,program,department').eq('id', userId).maybeSingle()) ?? {};

  const schoolSettings = await loadWorkspaceSchoolSettings();
  const explicitSpecKey = project?.metadata?.spec_key || input.specKey || schoolSettings.default_proposal_spec_key || null;
  const specData = explicitSpecKey
    ? await supabaseServer
        .from('document_specs')
        .select('key, spec_md, spec_json, title, description')
        .eq('key', explicitSpecKey)
        .maybeSingle()
        .then((result) => result.data || null)
    : await loadPreferredSpec();

  const specText = specData?.spec_md || '';
  const structuredSpec = parseStructuredSpec(specData?.spec_json);
  const requiredInputs = parseRequiredInputs(specText, sectionKey);

  const missingInputs = requiredInputs.filter((requiredInput) => !hasValue(project?.metadata?.[requiredInput] || (input as Record<string, unknown>)[requiredInput]));

  // Block only when identity/admin details needed for the cover page are
  // missing. For real chapters, infer carefully from the title/problem area
  // instead of stalling the workflow just because a preferred input wasn't
  // explicitly captured yet.
  if (missingInputs.length > 0 && isCoverSection(sectionKey)) {
    const question = `Need a bit more detail before drafting ${chapterKey}: ${missingInputs.join(', ')}.`;
    const nextMetadata = { ...(project?.metadata || {}), stage, awaiting_input: true, pending_input_question: question };
    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', userId);
    return { ok: true, status: 'awaiting_input', question, missingInputs };
  }

  const existingContent = String(
    (Array.isArray(project?.metadata?.chapters)
      ? (project.metadata.chapters as ProposalChapter[]).find((chapter) => chapter.chapter_key === chapterKey)?.content_md
      : '') || section?.content_md || ''
  ).trim();

  const system = [
    `You are the academic proposal drafting assistant for ${schoolSettings.school_name || SCHOOL_PROFILE.name} (${schoolSettings.school_short_name || SCHOOL_PROFILE.shortName}).`,
    buildZutProposalGuardrails(),
    'Write polished academic content with clear headings, concise paragraphs, practical detail, and strong alignment between title, problem, objectives, and methodology.',
    'The proposal spec (structured JSON) is authoritative for required sections, their order, and what each section must contain — there is no separate sample proposal in this workflow.',
    'Prefer title-driven inference when information is sparse, but never invent unverifiable identity details or fake citations.',
    'If references were auto-found from the title, treat them as candidate evidence, not guaranteed truth. Use only the references that are clearly relevant to the current chapter and the actual project topic.',
    'Citation style is IEEE, used consistently everywhere in this document: cite in-text with bracketed numbers only — e.g. "...as demonstrated in [1]." or "...this has been studied extensively [2], [3]." NEVER write Author (Year) prose citations in the body text. Each number MUST exactly match that source\'s numbered position in the reference list given below — that same number is what will appear next to it on the References page, so the numbers must line up exactly. Never invent a bracket number that isn\'t in the list.',
    'Avoid placeholders and generic filler.',
    existingContent
      ? 'A current draft for this exact section is provided below. Treat this as a revision/edit request, not a fresh rewrite: keep everything the user did not ask to change, and apply exactly what they asked for. Only produce a full rewrite if the user explicitly asks to start over.'
      : 'There is no existing draft for this section yet — write a complete, submission-ready first draft.',
    'Cover page and table of contents formatting are not strictly mandated by the school — keep them professional and clean, and always prioritize honoring specific user formatting requests (layout, wording, emphasis, order) over any default styling. Chapters 1-3 content must still follow the required structure from the spec.',
  ].join('\n');

  let userPrompt = promptText;
  if (['cover', 'cover_page'].includes(sectionKey)) {
    const studentName = profile?.full_name || input.userEmail || '';
    const studentId = profile?.student_id || '';
    const logoHint = schoolSettings.logo_path ? ` Use the stored school logo asset at ${schoolSettings.logo_path}.` : '';
    userPrompt =
      `Create a cover page for project titled "${project.title}". Student: ${studentName} (${studentId}). Supervisor: ${project.supervisor || ''}. Include the school logo on top and match the uploaded school cover-page style.${logoHint}` +
      (promptText ? `\nAdditional notes: ${promptText}` : '');
  }

  const referencesPayload: ProposalReference[] = Array.isArray(project?.metadata?.references) ? (project.metadata.references as ProposalReference[]) : [];
  // Numbered by array position — this MUST match the order the References
  // page renders them in (see proposalDocx.ts / export route's
  // toIeeeReferenceText, which also numbers by index+1), otherwise an
  // in-text [3] would point at the wrong source on the page.
  const referencesContext = referencesPayload.length
    ? [
        'Reference list — each is numbered exactly as it will appear on the References page. Use selectively, only when clearly relevant to the project title/section, and cite it using that exact bracket number (see citation style rule above):',
        ...referencesPayload.map((ref, i) => `[${i + 1}] ${ref.author || 'Unknown'} — "${ref.title}" (${ref.year || 'n.d.'})`),
        'Do not force every reference into the chapter. Use only the ones that actually fit the argument, and ignore weak or irrelevant matches.',
        'If the available references are shallow, say less rather than inventing evidence, and do not cite a bracket number for a claim it does not actually support.',
      ].join('\n')
    : 'No references supplied yet. If the user did not provide references, do not fabricate source details or citation numbers.';
  const chapterDiagramRequirements = getChapterDiagramRequirements(stage, chapterKey);
  const chapterDiagramKeys = getChapterDiagramKeys(stage, chapterKey);
  const diagramGuidance = chapterDiagramKeys.length
    ? [
        `Required diagram(s) for this section: ${chapterDiagramRequirements.join('; ')}.`,
        'For each required diagram, insert a single-line marker at the exact point it belongs in the text, using this precise format (no other text on that line):',
        ...chapterDiagramKeys.map((key) => `[DIAGRAM: ${key} — one-sentence description of what this diagram should show]`),
        'Do not draw the diagram yourself, do not describe it in prose, and do not use any key other than the one(s) given above — the marker is rendered into a real diagram automatically after you write it.',
      ].join('\n')
    : '';
  const chapterGuidance = buildChapterGenerationGuidance(stage, chapterKey, project.title);
  const standardsContext = buildProposalStandardContext(
    {
      title: project.title,
      department: project.department || profile?.department || null,
      supervisor: project.supervisor,
      academic_year: project.academic_year,
    },
    chapterKey
  );
  const literatureReviewGuidance =
    chapterKey === 'chapter_2' ? `\n\n${buildLiteratureReviewContext(project.title, project.department || '', referencesPayload)}` : '';
  const missingInputGuidance = missingInputs.length
    ? `Preferred but missing inputs: ${missingInputs.join(', ')}. Infer carefully from the title and ZUT examples where possible, and leave out unsupported personal/admin details.`
    : '';

  const structuredFragment = isCoverSection(sectionKey)
    ? getFrontOrBackMatterFragment(structuredSpec, 'cover_page')
    : getChapterSpecFragment(structuredSpec, chapterKey);
  const specFragment = structuredFragment || (specText ? extractMarkdownSectionForChapter(specText, chapterKey) : '');
  const specGuidance = specFragment ? `Document spec${specData?.title ? ` (${specData.title})` : ''}:\n${specFragment}\n\n` : '';

  if (!specFragment) {
    console.warn(
      `[proposal generate] Empty spec fragment for chapterKey="${chapterKey}" specKey="${explicitSpecKey}" (specRowFound=${Boolean(specData)}, hasSpecJson=${Boolean(specData?.spec_json)}, hasSpecMd=${Boolean(specText)}). Chapter content will rely on generic guidance only — run "npm run seed-proposal-spec" or check document_specs.spec_json for this key.`
    );
  }

  const requiredSectionNumbers = getChapterSectionNumbers(structuredSpec, chapterKey);
  const isExplicitRestart = /\b(start over|from scratch|rewrite (the )?whole|redo everything|full rewrite|restart)\b/i.test(promptText);
  const existingCompleteness = existingContent ? verifyChapterCompleteness(existingContent, requiredSectionNumbers) : { complete: true, missing: [] as string[] };
  const isTargetedFill = Boolean(existingContent) && !isExplicitRestart && requiredSectionNumbers.length > 0 && !existingCompleteness.complete;

  const existingContentBlock = existingContent
    ? `Current existing draft for this section (revise this based on the user's request below; preserve what was not asked to change):\n"""\n${existingContent}\n"""\n\n`
    : '';

  // Integrate context memory (recent decisions, user preferences) into prompt
  const contextualUserPrompt = input.context
    ? buildContextualGenerationPrompt({
        basePrompt: userPrompt,
        context: input.context,
        chapterKey,
      })
    : userPrompt; // If no context, use the basic user prompt as-is

  const modelInput = `${specGuidance}${standardsContext}\n\n${referencesContext}\n\n${diagramGuidance ? `${diagramGuidance}\n\n` : ''}${chapterGuidance}\n\n${missingInputGuidance}${literatureReviewGuidance}\n\n${existingContentBlock}User request:\n${contextualUserPrompt}`;

  let txId: string | null = null;
  try {
    const rpc = await supabaseServer.rpc('consume_credits', {
      p_user_id: userId,
      p_amount: creditsToSpend,
      p_description: `proposal_generation:${projectId}:${sectionKey}`,
      p_metadata: { project_id: projectId, sectionKey, provider, model },
    });
    if (rpc?.error) throw rpc.error;
    if (rpc?.data) txId = rpc.data;
  } catch (rpcErr: unknown) {
    const message = rpcErr instanceof Error ? rpcErr.message : 'Failed to deduct credits';
    return { ok: false, error: message, httpStatus: 402 };
  }

  const runTargetedFill = async (missingNumbers: string[], noteForModel: string, maxTokens = 1200): Promise<string> => {
    const missingGuidance = getMissingSectionsGuidance(structuredSpec, chapterKey, missingNumbers);
    const fillPrompt = [
      specGuidance.trim(),
      standardsContext,
      referencesContext,
      diagramGuidance,
      `The chapter "${input.chapterTitle || chapterKey}" already has a draft. It is missing these required section(s): ${missingNumbers.join(', ')}.`,
      missingGuidance,
      'Write ONLY the missing section(s) listed above, using the same numbered-heading style already used in the draft (e.g. "1.6 Significance of the Study"). Do not repeat, summarize, or rewrite any section that already exists — output only the new section text, nothing else.',
      noteForModel ? `User note: ${noteForModel}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const fillResponse = await runModel({ provider, model, system, messages: [{ role: 'user', content: fillPrompt }], maxTokens, signal });
    return String(fillResponse).trim();
  };

  let responseText = '';
  let completeness: { complete: boolean; missing: string[] };

  if (isTargetedFill) {
    try {
      const filled = await runTargetedFill(existingCompleteness.missing, promptText);
      responseText = `${existingContent}\n\n${filled}`.trim();
    } catch (mErr: unknown) {
      if (isAbortError(mErr)) {
        await refundCredits(userId, creditsToSpend, `proposal_generation_cancelled:${projectId}:${sectionKey}`, { project_id: projectId, sectionKey, rpc_tx: txId });
        return { ok: false, error: 'Cancelled', httpStatus: 499 };
      }
      const message = mErr instanceof Error ? mErr.message : 'Model error';
      return { ok: false, error: message, httpStatus: 500 };
    }
    completeness = verifyChapterCompleteness(responseText, requiredSectionNumbers);
  } else {
    let modelResponse = '';
    try {
      modelResponse = await runModel({ provider, model, system, messages: [{ role: 'user', content: modelInput }], maxTokens: 1500, signal });
    } catch (mErr: unknown) {
      if (isAbortError(mErr)) {
        await refundCredits(userId, creditsToSpend, `proposal_generation_cancelled:${projectId}:${sectionKey}`, { project_id: projectId, sectionKey, rpc_tx: txId });
        return { ok: false, error: 'Cancelled', httpStatus: 499 };
      }
      const message = mErr instanceof Error ? mErr.message : 'Model error';
      return { ok: false, error: message, httpStatus: 500 };
    }
    responseText = String(modelResponse);
    completeness = verifyChapterCompleteness(responseText, requiredSectionNumbers);
  }

  // Retry filling missing sections a few times instead of just once —
  // token-limited models (e.g. a free-tier Gemini model) commonly cut a
  // response short before every required section is written, and one
  // retry isn't always enough to close the gap. Bounded and stops the
  // moment a retry makes no further progress, so it never loops forever
  // burning model calls for no benefit.
  const MAX_COMPLETION_RETRIES = 3;
  let completionRetries = 0;
  while (!completeness.complete && completionRetries < MAX_COMPLETION_RETRIES) {
    completionRetries += 1;
    try {
      const filledAgain = await runTargetedFill(completeness.missing, '', 1400);
      const merged = `${responseText}\n\n${filledAgain}`.trim();
      const mergedCompleteness = verifyChapterCompleteness(merged, requiredSectionNumbers);
      if (mergedCompleteness.missing.length >= completeness.missing.length) {
        // No progress this round — further retries are unlikely to help.
        break;
      }
      responseText = merged;
      completeness = mergedCompleteness;
    } catch (retryErr: unknown) {
      console.error('Chapter completeness retry failed', retryErr);
      break;
    }
  }

  // Any [DIAGRAM: key — description] marker the model just wrote needs an
  // actual rendered image, not just a text placeholder — generate it now
  // (validate-then-render, cd.md's pipeline) for whichever markers don't
  // already have one. A diagram that fails to generate is never silently
  // dropped: it's surfaced as a warning and the marker stays visible as a
  // plain "pending" note in every renderer instead of looking finished.
  const existingDiagrams = ((project?.metadata as Record<string, unknown> | undefined)?.diagrams || {}) as Record<string, GeneratedDiagram>;
  const diagramMarkers = findDiagramMarkersInMarkdown(responseText);
  const diagramsUpdate: Record<string, GeneratedDiagram> = {};
  const diagramWarnings: string[] = [];
  const brandColor = String((project?.metadata as Record<string, unknown> | undefined)?.brand_color || '') || undefined;

  for (const marker of diagramMarkers) {
    if (existingDiagrams[marker.diagramKey]) continue; // already rendered previously — never silently regenerate/change it
    const result = await generateDiagram({
      diagramKey: marker.diagramKey,
      chapterTitle: input.chapterTitle || chapterKey,
      projectTitle: String(project.title || ''),
      instruction: marker.description,
      theme: brandColor ? { primaryColor: brandColor, lineColor: brandColor } : undefined,
      provider,
      model,
      signal,
    });
    if (result.ok) {
      diagramsUpdate[marker.diagramKey] = result;
    } else {
      diagramWarnings.push(result.error);
    }
  }

  const references = Array.isArray(input.references) ? input.references : [];
  const existingChapters: ProposalChapter[] = Array.isArray(project?.metadata?.chapters) ? (project.metadata.chapters as ProposalChapter[]) : [];
  const nextChapters = existingChapters.filter((chapter) => chapter.chapter_key !== chapterKey);
  nextChapters.push({
    chapter_key: chapterKey,
    title: input.chapterTitle || `Chapter ${chapterKey.replace(/chapter_/g, '')}`,
    content_md: responseText,
    stage,
    updated_at: new Date().toISOString(),
    incomplete: !completeness.complete,
    missing_sections: completeness.complete ? undefined : completeness.missing,
  });

  const chapterOrder = Array.isArray(project?.metadata?.chapters) ? (project.metadata.chapters as ProposalChapter[]).map((chapter) => chapter.chapter_key).filter(Boolean) : [];
  const completedChapterKeys = nextChapters
    .filter((chapter) => String(chapter.content_md || '').trim().length > 0 && !chapter.incomplete)
    .map((chapter) => String(chapter.chapter_key || ''))
    .filter(Boolean);
  const nextPendingChapterKey = !completeness.complete ? chapterKey : chapterOrder.find((key) => key && !completedChapterKeys.includes(key)) || null;
  const nextReferences = references.length ? [...referencesPayload, ...parseReferencesInput(references.join('\n'))] : referencesPayload;
  const initialProposalReady = isInitialProposalReady(nextChapters, nextReferences);

  const nextMetadata = {
    ...(project?.metadata || {}),
    stage,
    chapters: nextChapters,
    references: nextReferences,
    diagrams: { ...existingDiagrams, ...diagramsUpdate },
    awaiting_input: false,
    pending_input_question: null,
    school: schoolSettings.school_name || SCHOOL_PROFILE.name,
    school_short_name: schoolSettings.school_short_name || SCHOOL_PROFILE.shortName,
    last_generation_provider: provider,
    last_generation_model: model,
    workflow: {
      ...((project?.metadata?.workflow as Record<string, unknown> | undefined) || {}),
      mode: project?.metadata?.workflow_mode || 'classic',
      status: nextPendingChapterKey ? 'in_progress' : 'complete',
      current_chapter_key: chapterKey,
      next_chapter_key: nextPendingChapterKey,
      completed_chapter_keys: completedChapterKeys,
      chapter_queue: chapterOrder,
      initial_proposal_ready: initialProposalReady,
      last_action: 'chapter_generated',
      updated_at: new Date().toISOString(),
    },
  };

  await supabaseServer
    .from('proposal_projects')
    .update({
      metadata: nextMetadata,
      current_step: nextPendingChapterKey || chapterKey,
      status: nextPendingChapterKey ? 'in_progress' : 'complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('user_id', userId);

  const { error: insertError } = await supabaseServer.from('proposal_generations').insert({
    project_id: projectId,
    section_id: section?.id ?? null,
    prompt_type: 'ai_generate',
    prompt_text: promptText,
    response_text: responseText,
    credits_spent: creditsToSpend,
    model: `${provider}:${model}`,
    metadata: {
      attachments,
      spec_key: specData?.key || explicitSpecKey || 'default-proposal',
      rpc_tx: txId,
    },
  });

  if (insertError) return { ok: false, error: insertError.message, httpStatus: 500 };

  if (section) {
    await supabaseServer
      .from('proposal_sections')
      .update({ content_md: responseText, updated_at: new Date().toISOString() })
      .eq('id', section.id);
  }

  return {
    ok: true,
    status: 'generated',
    responseText,
    incomplete: !completeness.complete,
    missingSections: completeness.complete ? undefined : completeness.missing,
    nextChapterKey: completeness.complete && nextPendingChapterKey !== chapterKey ? nextPendingChapterKey : null,
    balance: (walletData?.balance_credits ?? 0) - creditsToSpend,
    diagramWarnings: diagramWarnings.length ? diagramWarnings : undefined,
  };
}
