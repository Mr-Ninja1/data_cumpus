import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { runModel } from '@/utils/models';
import { findSectionInMarkdown, findDiagramInMarkdown, replaceDiagramInMarkdown, insertDiagramInMarkdown } from '@/utils/sectionSplice';
import {
  ALLOWED_METADATA_FIELDS,
  PROJECT_COLUMN_FIELDS,
  buildSectionEditPrompt,
  buildFrontMatterContentPrompt,
  frontMatterPageTitle,
  getRequiredFrontMatter,
  insertFrontMatterPage,
  regenerateSection,
  updateFrontMatterOrder,
  type SectionEditReference,
} from '@/utils/proposalTools';
import { isAbortError, refundCredits } from '@/utils/creditsRefund';
import { generateDiagram } from '@/utils/diagramGeneration';
import { isKnownDiagramKey, DIAGRAM_REGISTRY } from '@/utils/diagramRegistry';

export const runtime = 'nodejs';

// Small, scoped edit costs — nowhere near full chapter generation cost,
// because these tools only ever touch what they need to.
const EDIT_CREDIT_COST = 1;

type ChapterEntry = { chapter_key?: string; title?: string; content_md?: string; stage?: string; updated_at?: string };

type EditActionBody =
  | { tool: 'update_metadata_field'; field: string; value: string }
  | { tool: 'update_front_matter_order'; new_order: string[] }
  | { tool: 'remove_front_matter_page'; page_type: string }
  | { tool: 'regenerate_chapter_section'; chapter_key: string; section_number?: string; instruction: string }
  | { tool: 'insert_front_matter_page'; page_type: string; instruction?: string }
  | { tool: 'regenerate_diagram'; chapter_key: string; diagram_key: string; instruction: string }
  | { tool: 'set_chapter_content'; chapter_key: string; title?: string; content_md: string };

// The tool-routing layer from idea.md Section 3 / cd.md. Every edit_request
// must land on exactly one of these scoped tools — never on a full
// chapter/document regeneration.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as EditActionBody | undefined;
  const confirmed = Boolean(body.confirmed);
  const provider = body.provider || process.env.MODEL_PROVIDER || 'local-stub';
  const model = body.model || 'default';

  if (!action || !action.tool) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const metadata = (project.metadata || {}) as Record<string, unknown>;
  const stage = String(metadata.stage || 'initial_proposal');

  if (action.tool === 'update_metadata_field') {
    const field = String(action.field || '');
    const value = String(action.value ?? '');

    if (!ALLOWED_METADATA_FIELDS.has(field)) {
      return NextResponse.json(
        { error: `Unsupported metadata field: "${field}". Allowed fields: ${Array.from(ALLOWED_METADATA_FIELDS).join(', ')}.` },
        { status: 400 }
      );
    }

    // title/department/supervisor/academic_year are real columns, not
    // metadata keys — write there directly so the cover page (which reads
    // the columns) actually reflects the change.
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (PROJECT_COLUMN_FIELDS.has(field)) {
      updatePayload[field] = value;
    } else {
      updatePayload.metadata = { ...metadata, [field]: value };
    }

    const { error: updateError } = await supabaseServer
      .from('proposal_projects')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ applied: true, tool: action.tool, field, value });
  }

  if (action.tool === 'update_front_matter_order') {
    const newOrder = Array.isArray(action.new_order) ? action.new_order.map(String) : [];
    const currentOrder = Array.isArray(metadata.front_matter_order)
      ? (metadata.front_matter_order as string[])
      : getRequiredFrontMatter(stage);

    // Never confirm-and-execute silently for structural removals — ask
    // first, unless the caller has already confirmed.
    const result = updateFrontMatterOrder(newOrder, stage);
    if (!result.ok && !confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: result.message,
        missing: result.missing,
        proposedOrder: newOrder,
        currentOrder,
      });
    }

    const nextMetadata = { ...metadata, front_matter_order: newOrder };
    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({
      applied: true,
      tool: action.tool,
      order: newOrder,
      removedRequired: !result.ok ? result.missing : undefined,
    });
  }

  if (action.tool === 'remove_front_matter_page') {
    const pageType = String(action.page_type || '');
    const currentOrder = Array.isArray(metadata.front_matter_order)
      ? (metadata.front_matter_order as string[])
      : getRequiredFrontMatter(stage);

    if (!currentOrder.includes(pageType)) {
      return NextResponse.json({ error: `"${pageType}" isn't in the front matter order — nothing to remove.` }, { status: 400 });
    }

    const newOrder = currentOrder.filter((key) => key !== pageType);

    // Same required-structure guard as update_front_matter_order — removing
    // something the school's structure requires needs explicit confirmation.
    const result = updateFrontMatterOrder(newOrder, stage);
    if (!result.ok && !confirmed) {
      return NextResponse.json({
        requiresConfirmation: true,
        message: result.message,
        missing: result.missing,
        proposedOrder: newOrder,
        currentOrder,
      });
    }

    const nextMetadata = { ...metadata, front_matter_order: newOrder };
    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({ applied: true, tool: action.tool, pageType, order: newOrder });
  }

  if (action.tool === 'regenerate_chapter_section') {
    const chapterKey = String(action.chapter_key || '');
    const sectionNumber = action.section_number ? String(action.section_number) : undefined;
    const instruction = String(action.instruction || '').trim();

    if (!chapterKey || !instruction) {
      return NextResponse.json({ error: 'Missing chapter_key or instruction' }, { status: 400 });
    }

    const chapters: ChapterEntry[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ChapterEntry[]) : [];
    const chapter = chapters.find((entry) => entry.chapter_key === chapterKey);
    if (!chapter) {
      return NextResponse.json(
        { error: `No existing content for "${chapterKey}" yet — generate it first before editing.` },
        { status: 404 }
      );
    }

    const { data: walletData } = await supabaseServer.from('wallets').select('*').eq('user_id', user.id).maybeSingle();
    if ((walletData?.balance_credits ?? 0) < EDIT_CREDIT_COST) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    let scopedCurrentText = String(chapter.content_md || '');
    if (sectionNumber) {
      const found = findSectionInMarkdown(chapter.content_md || '', sectionNumber);
      if (!found) {
        return NextResponse.json(
          { error: `Could not find section ${sectionNumber} in ${chapter.title || chapterKey}.` },
          { status: 404 }
        );
      }
      scopedCurrentText = found.body;
    }

    const references = Array.isArray(metadata.references) ? (metadata.references as SectionEditReference[]) : [];
    const prompt = buildSectionEditPrompt({
      chapterTitle: chapter.title || chapterKey,
      sectionNumber,
      currentText: scopedCurrentText,
      instruction,
      references,
    });

    let txId: string | null = null;
    try {
      const rpc = await supabaseServer.rpc('consume_credits', {
        p_user_id: user.id,
        p_amount: EDIT_CREDIT_COST,
        p_description: `proposal_edit:${id}:${chapterKey}${sectionNumber ? `:${sectionNumber}` : ''}`,
        p_metadata: { project_id: id, chapterKey, sectionNumber },
      });
      if (rpc?.error) throw rpc.error;
      if (rpc?.data) txId = rpc.data;
    } catch (rpcErr: unknown) {
      const messageText = rpcErr instanceof Error ? rpcErr.message : 'Failed to deduct credits';
      return NextResponse.json({ error: messageText }, { status: 402 });
    }

    let responseText = '';
    try {
      responseText = String(
        await runModel({
          provider,
          model,
          system: 'You are a precise academic editor. Follow the instruction exactly and change only what was asked.',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 900,
          signal: req.signal,
        })
      );
    } catch (mErr: unknown) {
      if (isAbortError(mErr)) {
        await refundCredits(user.id, EDIT_CREDIT_COST, `proposal_edit_cancelled:${id}:${chapterKey}`, { project_id: id, chapterKey, sectionNumber, rpc_tx: txId });
        return NextResponse.json({ error: 'Cancelled' }, { status: 499 });
      }
      const messageText = mErr instanceof Error ? mErr.message : 'Model error';
      return NextResponse.json({ error: messageText }, { status: 500 });
    }

    const nextContentMd = regenerateSection(chapter.content_md || '', sectionNumber, responseText.trim());
    const nextChapters = chapters.map((entry) =>
      entry.chapter_key === chapterKey ? { ...entry, content_md: nextContentMd, updated_at: new Date().toISOString() } : entry
    );
    const nextMetadata = { ...metadata, chapters: nextChapters };

    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    await supabaseServer.from('proposal_generations').insert({
      project_id: id,
      section_id: null,
      prompt_type: 'ai_edit',
      prompt_text: prompt,
      response_text: responseText,
      credits_spent: EDIT_CREDIT_COST,
      model: `${provider}:${model}`,
      metadata: { chapterKey, sectionNumber, rpc_tx: txId },
    });

    return NextResponse.json({
      applied: true,
      tool: action.tool,
      chapterKey,
      sectionNumber,
      updatedText: responseText.trim(),
      balance: (walletData?.balance_credits ?? 0) - EDIT_CREDIT_COST,
    });
  }

  if (action.tool === 'insert_front_matter_page') {
    const pageType = String(action.page_type || '');
    const instruction = String(action.instruction || '').trim();
    const validPageTypes = ['abstract', 'acknowledgement', 'dedication'];
    if (!validPageTypes.includes(pageType)) {
      return NextResponse.json(
        { error: `Unsupported page_type: "${pageType}". Allowed: ${validPageTypes.join(', ')}.` },
        { status: 400 }
      );
    }

    const currentOrder = Array.isArray(metadata.front_matter_order)
      ? (metadata.front_matter_order as string[])
      : getRequiredFrontMatter(stage);
    const nextOrder = insertFrontMatterPage(currentOrder, pageType);

    const chapters: ChapterEntry[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ChapterEntry[]) : [];
    const existing = chapters.find((entry) => entry.chapter_key === pageType);

    // Page already has content — this is just an ordering change, no LLM
    // call, no credit cost.
    if (existing && existing.content_md) {
      const nextMetadata = { ...metadata, front_matter_order: nextOrder };
      await supabaseServer
        .from('proposal_projects')
        .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);

      return NextResponse.json({ applied: true, tool: action.tool, pageType, order: nextOrder, generated: false });
    }

    const { data: walletData } = await supabaseServer.from('wallets').select('*').eq('user_id', user.id).maybeSingle();
    if ((walletData?.balance_credits ?? 0) < EDIT_CREDIT_COST) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const prompt = buildFrontMatterContentPrompt({
      pageType,
      projectTitle: String(project.title || metadata.title || 'this proposal'),
      instruction,
    });

    let txId: string | null = null;
    try {
      const rpc = await supabaseServer.rpc('consume_credits', {
        p_user_id: user.id,
        p_amount: EDIT_CREDIT_COST,
        p_description: `proposal_edit:${id}:insert_front_matter:${pageType}`,
        p_metadata: { project_id: id, pageType },
      });
      if (rpc?.error) throw rpc.error;
      if (rpc?.data) txId = rpc.data;
    } catch (rpcErr: unknown) {
      const messageText = rpcErr instanceof Error ? rpcErr.message : 'Failed to deduct credits';
      return NextResponse.json({ error: messageText }, { status: 402 });
    }

    let responseText = '';
    try {
      responseText = String(
        await runModel({
          provider,
          model,
          system: 'You are a precise academic editor writing a single front-matter page for a proposal.',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 500,
          signal: req.signal,
        })
      );
    } catch (mErr: unknown) {
      if (isAbortError(mErr)) {
        await refundCredits(user.id, EDIT_CREDIT_COST, `proposal_edit_cancelled:${id}:insert_front_matter:${pageType}`, { project_id: id, pageType, rpc_tx: txId });
        return NextResponse.json({ error: 'Cancelled' }, { status: 499 });
      }
      const messageText = mErr instanceof Error ? mErr.message : 'Model error';
      return NextResponse.json({ error: messageText }, { status: 500 });
    }

    const nextChapters = [
      ...chapters.filter((entry) => entry.chapter_key !== pageType),
      {
        chapter_key: pageType,
        title: frontMatterPageTitle(pageType),
        content_md: responseText.trim(),
        stage,
        updated_at: new Date().toISOString(),
      },
    ];
    const nextMetadata = { ...metadata, front_matter_order: nextOrder, chapters: nextChapters };

    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    await supabaseServer.from('proposal_generations').insert({
      project_id: id,
      section_id: null,
      prompt_type: 'ai_edit',
      prompt_text: prompt,
      response_text: responseText,
      credits_spent: EDIT_CREDIT_COST,
      model: `${provider}:${model}`,
      metadata: { pageType, rpc_tx: txId },
    });

    return NextResponse.json({
      applied: true,
      tool: action.tool,
      pageType,
      order: nextOrder,
      generated: true,
      updatedText: responseText.trim(),
      balance: (walletData?.balance_credits ?? 0) - EDIT_CREDIT_COST,
    });
  }

  if (action.tool === 'regenerate_diagram') {
    const chapterKey = String(action.chapter_key || '');
    const diagramKey = String(action.diagram_key || '').trim().toLowerCase();
    const instruction = String(action.instruction || '').trim();

    if (!chapterKey || !diagramKey || !instruction) {
      return NextResponse.json({ error: 'Missing chapter_key, diagram_key, or instruction' }, { status: 400 });
    }

    if (!isKnownDiagramKey(diagramKey)) {
      return NextResponse.json({ error: `Unknown diagram type "${diagramKey}". Known types: ${Object.keys(DIAGRAM_REGISTRY).join(', ')}.` }, { status: 400 });
    }

    const chapters: ChapterEntry[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ChapterEntry[]) : [];
    const chapter = chapters.find((entry) => entry.chapter_key === chapterKey);
    if (!chapter) {
      return NextResponse.json(
        { error: `No existing content for "${chapterKey}" yet — generate it first before editing its diagrams.` },
        { status: 404 }
      );
    }

    const { data: walletData } = await supabaseServer.from('wallets').select('*').eq('user_id', user.id).maybeSingle();
    if ((walletData?.balance_credits ?? 0) < EDIT_CREDIT_COST) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const currentContentMd = String(chapter.content_md || '');
    const found = findDiagramInMarkdown(currentContentMd, diagramKey);

    let txId: string | null = null;
    try {
      const rpc = await supabaseServer.rpc('consume_credits', {
        p_user_id: user.id,
        p_amount: EDIT_CREDIT_COST,
        p_description: `proposal_edit:${id}:${chapterKey}:diagram:${diagramKey}`,
        p_metadata: { project_id: id, chapterKey, diagramKey },
      });
      if (rpc?.error) throw rpc.error;
      if (rpc?.data) txId = rpc.data;
    } catch (rpcErr: unknown) {
      const messageText = rpcErr instanceof Error ? rpcErr.message : 'Failed to deduct credits';
      return NextResponse.json({ error: messageText }, { status: 402 });
    }

    // Real generate-validate-render pipeline (cd.md) instead of a text-only
    // description rewrite — this is what actually produces/updates the image.
    const brandColor = String((metadata as Record<string, unknown>).brand_color || '') || undefined;
    let result: Awaited<ReturnType<typeof generateDiagram>>;
    try {
      result = await generateDiagram({
        diagramKey,
        chapterTitle: chapter.title || chapterKey,
        projectTitle: String(project.title || ''),
        instruction: found?.description ? `${instruction} (previous description: ${found.description})` : instruction,
        theme: brandColor ? { primaryColor: brandColor, lineColor: brandColor } : undefined,
        provider,
        model,
        signal: req.signal,
      });
    } catch (mErr: unknown) {
      if (isAbortError(mErr)) {
        await refundCredits(user.id, EDIT_CREDIT_COST, `proposal_edit_cancelled:${id}:${chapterKey}:diagram:${diagramKey}`, { project_id: id, chapterKey, diagramKey, rpc_tx: txId });
        return NextResponse.json({ error: 'Cancelled' }, { status: 499 });
      }
      const messageText = mErr instanceof Error ? mErr.message : 'Diagram generation failed';
      await refundCredits(user.id, EDIT_CREDIT_COST, `proposal_edit_failed:${id}:${chapterKey}:diagram:${diagramKey}`, { project_id: id, chapterKey, diagramKey, rpc_tx: txId });
      return NextResponse.json({ error: messageText }, { status: 500 });
    }

    if (!result.ok) {
      // Never silently keep a broken/unchanged diagram — refund and tell the
      // user exactly what went wrong instead.
      await refundCredits(user.id, EDIT_CREDIT_COST, `proposal_edit_failed:${id}:${chapterKey}:diagram:${diagramKey}`, { project_id: id, chapterKey, diagramKey, rpc_tx: txId });
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const newDescription = instruction;
    const nextContentMd = found
      ? replaceDiagramInMarkdown(currentContentMd, diagramKey, newDescription) || currentContentMd
      : insertDiagramInMarkdown(currentContentMd, diagramKey, newDescription);

    const nextChapters = chapters.map((entry) =>
      entry.chapter_key === chapterKey ? { ...entry, content_md: nextContentMd, updated_at: new Date().toISOString() } : entry
    );
    const existingDiagrams = (metadata.diagrams || {}) as Record<string, unknown>;
    const nextMetadata = {
      ...metadata,
      chapters: nextChapters,
      diagrams: { ...existingDiagrams, [diagramKey]: result },
    };

    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    await supabaseServer.from('proposal_generations').insert({
      project_id: id,
      section_id: null,
      prompt_type: 'ai_edit',
      prompt_text: instruction,
      response_text: result.source,
      credits_spent: EDIT_CREDIT_COST,
      model: `${provider}:${model}`,
      metadata: { chapterKey, diagramKey, rpc_tx: txId },
    });

    return NextResponse.json({
      applied: true,
      tool: action.tool,
      chapterKey,
      diagramKey,
      updatedText: newDescription,
      balance: (walletData?.balance_credits ?? 0) - EDIT_CREDIT_COST,
    });
  }

  if (action.tool === 'set_chapter_content') {
    const chapterKey = String(action.chapter_key || '');
    const contentMd = String(action.content_md ?? '');

    if (!chapterKey) {
      return NextResponse.json({ error: 'Missing chapter_key' }, { status: 400 });
    }

    const chapters: ChapterEntry[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ChapterEntry[]) : [];
    const existing = chapters.find((entry) => entry.chapter_key === chapterKey);

    const nextChapters = existing
      ? chapters.map((entry) =>
          entry.chapter_key === chapterKey
            ? { ...entry, content_md: contentMd, updated_at: new Date().toISOString() }
            : entry
        )
      : [
          ...chapters,
          {
            chapter_key: chapterKey,
            title: action.title || chapterKey,
            content_md: contentMd,
            stage,
            updated_at: new Date().toISOString(),
          },
        ];

    const nextMetadata = { ...metadata, chapters: nextChapters };
    await supabaseServer
      .from('proposal_projects')
      .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({ applied: true, tool: action.tool, chapterKey, updatedText: contentMd });
  }

  return NextResponse.json({ error: `Unsupported tool: ${(action as { tool?: string }).tool}` }, { status: 400 });
}
