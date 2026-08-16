// Autopilot: keeps drafting a proposal one chapter/step at a time until the
// stage's required deliverable is actually complete, without a user having
// to send another message. Each call does exactly ONE step (one chapter
// generation or targeted fill) so it's safe to call repeatedly from a
// worker loop — see scripts/autopilot-worker.js and
// /api/generator/autopilot-tick/route.ts.

import { supabaseServer } from './supabaseServerClient';
import { generateOrContinueChapter, type ProposalChapter } from './chapterGenerationEngine';
import { discoverReferencesForTitle, mergeReferencesPreservingOrder } from './referenceDiscovery';
import { isInitialProposalReady } from './proposalFlow';

// Same per-generation cost the interactive UI uses (CREDITS_COST in the
// workspace page) — kept as one constant so autopilot never silently
// undercharges relative to a manual "Continue" click.
export const AUTOPILOT_STEP_COST = 3;
export const AUTOPILOT_MAX_CONSECUTIVE_FAILURES = 3;

type ProjectRow = {
  id: string;
  user_id: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
};

export type AutopilotStepResult =
  | { status: 'progressed'; chapterKey: string; incomplete: boolean }
  | { status: 'found_references'; count: number }
  | { status: 'completed' }
  | { status: 'insufficient_credits' }
  | { status: 'blocked_needs_input'; question: string }
  | { status: 'error'; message: string };

/** Picks the next thing autopilot should do for this project, and does exactly one step of it. */
export async function runAutopilotStep(project: ProjectRow): Promise<AutopilotStepResult> {
  if (!supabaseServer) return { status: 'error', message: 'Server not configured' };

  const metadata = (project.metadata || {}) as Record<string, unknown>;
  const chapters: ProposalChapter[] = Array.isArray(metadata.chapters) ? (metadata.chapters as ProposalChapter[]) : [];
  const references = Array.isArray(metadata.references) ? (metadata.references as unknown[]) : [];
  const stage = String(metadata.stage || 'initial_proposal');

  const target = chapters.find((chapter) => !String(chapter.content_md || '').trim().length || chapter.incomplete);

  if (!target) {
    if (isInitialProposalReady(chapters, references)) {
      return { status: 'completed' };
    }

    // Every listed chapter has content, but references are still missing —
    // autopilot can find these itself instead of stalling.
    if (!references.length) {
      const discovered = await discoverReferencesForTitle(String(project.title || ''));
      if (discovered.references.length) {
        const mergedReferences = mergeReferencesPreservingOrder(references as any[], discovered.references as any[]);
        const nextMetadata = {
          ...metadata,
          references: mergedReferences,
          reference_lookup: discovered.lookup,
        };
        await supabaseServer.from('proposal_projects').update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', project.id);
        return { status: 'found_references', count: mergedReferences.length };
      }
      // Genuinely couldn't find anything credible — don't loop forever on this.
      return { status: 'error', message: discovered.lookup.message || 'Could not find references automatically for this title.' };
    }

    return { status: 'completed' };
  }

  const { data: wallet } = await supabaseServer.from('wallets').select('balance_credits').eq('user_id', project.user_id).maybeSingle();
  if ((wallet?.balance_credits ?? 0) < AUTOPILOT_STEP_COST) {
    return { status: 'insufficient_credits' };
  }

  const provider = String(metadata.last_generation_provider || process.env.MODEL_PROVIDER || 'local-stub');
  const model = String(metadata.last_generation_model || 'default');

  const result = await generateOrContinueChapter({
    userId: project.user_id,
    projectId: project.id,
    sectionKey: target.chapter_key || '',
    chapterKey: target.chapter_key,
    chapterTitle: target.title,
    promptText: target.incomplete
      ? 'Continue drafting this chapter and fill in every missing required section.'
      : 'Draft this section completely, covering every section listed in the spec.',
    stage,
    creditsToSpend: AUTOPILOT_STEP_COST,
    provider,
    model,
  });

  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  if (result.status === 'awaiting_input') {
    return { status: 'blocked_needs_input', question: result.question };
  }

  return { status: 'progressed', chapterKey: target.chapter_key || '', incomplete: result.incomplete };
}

/** Writes a system notification into the real messages inbox so it survives
 * across sessions/devices — not just an in-memory toast. sender_id is null
 * (system message), which the messages table already supports. */
export async function notifyAutopilotEvent(userId: string, subject: string, body: string, metadata: Record<string, unknown> = {}) {
  if (!supabaseServer) return;
  await supabaseServer.from('messages').insert({
    recipient_id: userId,
    sender_id: null,
    subject,
    body,
    kind: 'dm',
    metadata: { ...metadata, source: 'autopilot' },
  });
}
