import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { AUTOPILOT_MAX_CONSECUTIVE_FAILURES, notifyAutopilotEvent, runAutopilotStep } from '@/utils/autopilotEngine';

export const runtime = 'nodejs';

const BATCH_SIZE = 5;

type ProjectRow = {
  id: string;
  user_id: string;
  title?: string;
  metadata?: Record<string, unknown> | null;
  autopilot_status?: string;
};

function getAutopilotMeta(project: ProjectRow): Record<string, unknown> {
  return ((project.metadata as Record<string, unknown> | null)?.autopilot as Record<string, unknown>) || {};
}

async function updateProject(id: string, patch: Record<string, unknown>, metadataPatch?: Record<string, unknown>, project?: ProjectRow) {
  if (!supabaseServer) return;
  const nextMetadata = metadataPatch
    ? {
        ...(project?.metadata || {}),
        autopilot: { ...getAutopilotMeta(project as ProjectRow), ...metadataPatch, updated_at: new Date().toISOString() },
      }
    : undefined;
  await supabaseServer
    .from('proposal_projects')
    .update({ ...patch, ...(nextMetadata ? { metadata: nextMetadata } : {}), updated_at: new Date().toISOString() })
    .eq('id', id);
}

/**
 * Worker-callable tick: processes one autopilot step for a small batch of
 * due projects and returns. Designed to be called repeatedly by a
 * long-running poller (scripts/autopilot-worker.js) — never assume this is
 * called via a browser tab; it must keep working even if every user who
 * enabled autopilot has closed the site.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== process.env.WORKER_BEARER) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseServer) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const { data: dueProjects, error } = await supabaseServer
    .from('proposal_projects')
    .select('id, user_id, title, metadata, autopilot_status')
    .eq('autopilot_enabled', true)
    .in('autopilot_status', ['queued', 'running'])
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ projectId: string; status: string }> = [];

  for (const project of (dueProjects as ProjectRow[]) || []) {
    try {
      const step = await runAutopilotStep(project);

      if (step.status === 'progressed' || step.status === 'found_references') {
        await updateProject(project.id, { autopilot_status: 'running' }, { consecutive_failures: 0, last_error: null }, project);
      } else if (step.status === 'completed') {
        await updateProject(project.id, { autopilot_status: 'completed', autopilot_enabled: false }, { consecutive_failures: 0, last_error: null, completed_at: new Date().toISOString() }, project);
        await notifyAutopilotEvent(
          project.user_id,
          'Your proposal is ready',
          `"${project.title || 'Your proposal'}" has been fully drafted on autopilot — every required chapter and reference is in place. Open the workspace to review and export it.`,
          { projectId: project.id, event: 'completed' }
        );
      } else if (step.status === 'insufficient_credits') {
        await updateProject(project.id, { autopilot_status: 'paused_insufficient_credits' }, { last_error: 'insufficient_credits' }, project);
        await notifyAutopilotEvent(
          project.user_id,
          'Autopilot paused — needs more credits',
          `Autopilot on "${project.title || 'your proposal'}" ran out of credits. Top up your wallet and turn autopilot back on to keep going.`,
          { projectId: project.id, event: 'paused_insufficient_credits' }
        );
      } else if (step.status === 'blocked_needs_input') {
        await updateProject(project.id, { autopilot_status: 'failed', autopilot_enabled: false }, { last_error: step.question }, project);
        await notifyAutopilotEvent(
          project.user_id,
          'Autopilot needs your input',
          `Autopilot on "${project.title || 'your proposal'}" stopped because it needs more detail: ${step.question}`,
          { projectId: project.id, event: 'blocked_needs_input' }
        );
      } else {
        // error — retry a few times before giving up, so a single flaky
        // model call doesn't kill an otherwise-working autopilot run.
        const consecutiveFailures = Number(getAutopilotMeta(project).consecutive_failures || 0) + 1;
        if (consecutiveFailures >= AUTOPILOT_MAX_CONSECUTIVE_FAILURES) {
          await updateProject(project.id, { autopilot_status: 'failed', autopilot_enabled: false }, { consecutive_failures: consecutiveFailures, last_error: step.message }, project);
          await notifyAutopilotEvent(
            project.user_id,
            'Autopilot stopped',
            `Autopilot on "${project.title || 'your proposal'}" hit a repeated error and stopped: ${step.message}. Open the workspace to continue manually.`,
            { projectId: project.id, event: 'failed' }
          );
        } else {
          await updateProject(project.id, { autopilot_status: 'running' }, { consecutive_failures: consecutiveFailures, last_error: step.message }, project);
        }
      }

      results.push({ projectId: project.id, status: step.status });
    } catch (err) {
      console.error('Autopilot tick failed for project', project.id, err);
      results.push({ projectId: project.id, status: 'tick_error' });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
