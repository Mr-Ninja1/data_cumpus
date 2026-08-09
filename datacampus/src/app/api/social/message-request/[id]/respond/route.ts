import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === 'decline' ? 'decline' : body.action === 'block' ? 'block' : 'accept';

  const { data: message, error: fetchErr } = await supabaseServer
    .from('messages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !message) {
    return NextResponse.json({ error: 'Message request not found' }, { status: 404 });
  }
  if (message.recipient_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (message.kind !== 'request') {
    return NextResponse.json({ error: 'Not a pending request' }, { status: 400 });
  }
  const metadata = (message.metadata || {}) as { status?: string; fee_charged?: number };
  if (metadata.status && metadata.status !== 'pending') {
    return NextResponse.json({ ok: true, status: metadata.status, alreadyHandled: true });
  }

  const feeCharged = Math.max(0, Math.floor(metadata.fee_charged || 0));
  const newStatus = action === 'accept' ? 'accepted' : action === 'block' ? 'blocked' : 'declined';

  // Refund the fee on decline/block — the sender only pays if the
  // recipient actually engages. This is a plain reversal (fee_bps = 0),
  // not a new fee-bearing transaction, so nothing extra goes to the
  // platform for a refund.
  if (feeCharged > 0 && newStatus !== 'accepted') {
    const { error: refundErr } = await supabaseServer.rpc('wallet_transfer', {
      p_from: user.id,
      p_to: message.sender_id,
      p_amount: feeCharged,
      p_fee_bps: 0,
      p_kind: 'message_request_refund',
      p_metadata: { message_id: id },
      p_count_as_earning: false,
    });
    if (refundErr) {
      return NextResponse.json(
        { error: refundErr.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : refundErr.message },
        { status: 500 }
      );
    }
  }

  const { error: updateErr } = await supabaseServer
    .from('messages')
    .update({ metadata: { ...metadata, status: newStatus }, kind: newStatus === 'accepted' ? 'dm' : 'request' })
    .eq('id', id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (newStatus === 'blocked') {
    await supabaseServer
      .from('blocks')
      .upsert({ blocker_id: user.id, blocked_id: message.sender_id }, { onConflict: 'blocker_id,blocked_id' });
  }

  return NextResponse.json({ ok: true, status: newStatus, feeRefunded: newStatus !== 'accepted' ? feeCharged : 0 });
}
