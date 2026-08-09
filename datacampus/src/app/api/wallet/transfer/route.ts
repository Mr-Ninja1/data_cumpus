import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Peer-to-peer credit transfer — "send credits to a friend" / gifting.
// 0% platform fee by default (see platform_settings.p2p_fee_bps) — gifting
// between friends stays 100% liquid unless you deliberately turn on a cut.
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null;
  const amount = Math.floor(Number(body.amount || 0));
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ error: 'Pick someone else to send credits to' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount' }, { status: 400 });
  }

  const { data: recipientProfile } = await supabaseServer
    .from('profiles')
    .select('id, display_name')
    .eq('id', recipientId)
    .maybeSingle();
  if (!recipientProfile) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  const { data: blocked } = await supabaseServer
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${user.id})`
    )
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: 'You cannot send credits to this user' }, { status: 403 });
  }

  const { data: settings } = await supabaseServer
    .from('platform_settings')
    .select('p2p_fee_bps')
    .eq('id', true)
    .maybeSingle();
  const feeBps = settings?.p2p_fee_bps ?? 0;

  const { data: result, error } = await supabaseServer.rpc('wallet_transfer', {
    p_from: user.id,
    p_to: recipientId,
    p_amount: amount,
    p_fee_bps: feeBps,
    p_kind: 'transfer',
    p_metadata: { note, to_name: recipientProfile.display_name },
  });

  if (error) {
    if (error.message.includes('insufficient_credits')) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }
    return NextResponse.json(
      { error: error.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : error.message },
      { status: 500 }
    );
  }

  await supabaseServer.from('notifications').insert({
    user_id: recipientId,
    kind: 'credits_received',
    title: 'You received credits',
    body: note ? `You got ${result.recipient_share} credits: "${note}"` : `You got ${result.recipient_share} credits`,
    link: '/wallet',
    data: { from: user.id, amount: result.recipient_share },
  });

  return NextResponse.json({ ok: true, balance: result.from_balance, amount: result.recipient_share });
}
