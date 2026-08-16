import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { AUTOPILOT_STEP_COST } from '@/utils/autopilotEngine';

export const runtime = 'nodejs';

// Turns autopilot on/off for a project. Turning it on doesn't generate
// anything itself — it just flags the project so the background worker
// (scripts/autopilot-worker.js -> this same generation pipeline) picks it
// up and keeps going until the stage's required chapters + references are
// actually complete, even if the student closes the tab.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);

  const { data: project, error: projectError } = await supabaseServer
    .from('proposal_projects')
    .select('id, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  if (enabled) {
    const { data: wallet } = await supabaseServer.from('wallets').select('balance_credits').eq('user_id', user.id).maybeSingle();
    if ((wallet?.balance_credits ?? 0) < AUTOPILOT_STEP_COST) {
      return NextResponse.json({ error: 'Not enough credits to start autopilot — top up first.' }, { status: 402 });
    }
  }

  const nextMetadata = {
    ...(project.metadata || {}),
    autopilot: {
      ...(((project.metadata as Record<string, unknown> | null)?.autopilot as Record<string, unknown>) || {}),
      enabled,
      consecutive_failures: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
      ...(enabled ? { started_at: new Date().toISOString() } : {}),
    },
  };

  const { data: updated, error: updateError } = await supabaseServer
    .from('proposal_projects')
    .update({
      metadata: nextMetadata,
      autopilot_enabled: enabled,
      autopilot_status: enabled ? 'queued' : 'idle',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ project: updated });
}
