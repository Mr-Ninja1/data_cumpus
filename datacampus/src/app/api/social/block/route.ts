import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Direct block (from a profile page), independent of a message request.
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const blockedId = typeof body.userId === 'string' ? body.userId : null;
  if (!blockedId || blockedId === user.id) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const blockedId = url.searchParams.get('userId');
  if (!blockedId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
