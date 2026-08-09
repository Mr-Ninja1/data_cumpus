import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';
import { conversationKey } from '@/utils/roles';

export const runtime = 'nodejs';

const DAILY_REQUEST_LIMIT = 5;

/**
 * Anti-harassment gate for first contact between two people who have
 * never messaged or followed each other:
 *  - if they're already "connected" (any prior message either way, or a
 *    follow relationship either way), the message sends immediately, free.
 *  - otherwise it's a cold "message request": rate-limited per day, and
 *    optionally charges the recipient's configured message_fee_credits
 *    (split atomically with the platform; refunded automatically if the
 *    recipient declines or blocks).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 120) || null : null;

  if (!recipientId || recipientId === user.id) {
    return NextResponse.json({ error: 'Invalid recipient' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }

  const { data: blocked } = await supabaseServer
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${user.id})`
    )
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: 'You cannot message this user' }, { status: 403 });
  }

  const { data: recipientProfile, error: profileErr } = await supabaseServer
    .from('profiles')
    .select('id, display_name, message_fee_credits')
    .eq('id', recipientId)
    .maybeSingle();
  if (profileErr || !recipientProfile) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  const key = conversationKey(user.id, recipientId);

  const [{ data: priorMessage }, { data: followEitherWay }] = await Promise.all([
    supabaseServer
      .from('messages')
      .select('id')
      .eq('conversation_key', key)
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from('follows')
      .select('id')
      .or(
        `and(follower_id.eq.${user.id},following_id.eq.${recipientId}),and(follower_id.eq.${recipientId},following_id.eq.${user.id})`
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const connected = Boolean(priorMessage) || Boolean(followEitherWay);

  if (connected) {
    const { data: msg, error } = await supabaseServer
      .from('messages')
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        body: text.slice(0, 4000),
        subject,
        kind: 'dm',
        conversation_key: key,
        read: false,
        metadata: {},
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: 'sent', messageId: msg.id, feeCharged: 0 });
  }

  // Cold outreach — rate limit per sender per day.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: requestCountToday } = await supabaseServer
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .eq('kind', 'request')
    .gte('created_at', since);

  if ((requestCountToday ?? 0) >= DAILY_REQUEST_LIMIT) {
    return NextResponse.json(
      { error: `You've reached today's limit of ${DAILY_REQUEST_LIMIT} message requests to new people. Try again tomorrow.` },
      { status: 429 }
    );
  }

  const fee = Math.max(0, Math.floor(recipientProfile.message_fee_credits || 0));

  if (fee > 0) {
    const { data: senderWallet } = await supabaseServer
      .from('wallets')
      .select('balance_credits')
      .eq('user_id', user.id)
      .maybeSingle();
    if ((senderWallet?.balance_credits ?? 0) < fee) {
      return NextResponse.json(
        {
          error: `${recipientProfile.display_name || 'This user'} charges ${fee} credits to message them for the first time. Top up your wallet first.`,
        },
        { status: 402 }
      );
    }

    const { data: settings } = await supabaseServer
      .from('platform_settings')
      .select('message_fee_bps')
      .eq('id', true)
      .maybeSingle();
    const feeBps = settings?.message_fee_bps ?? 1500;

    // Charged as a "held" earning — auto-refunded via the reverse RPC call
    // in /respond if the recipient declines or blocks instead of accepting.
    const { error: rpcError } = await supabaseServer.rpc('wallet_transfer', {
      p_from: user.id,
      p_to: recipientId,
      p_amount: fee,
      p_fee_bps: feeBps,
      p_kind: 'message_request_fee',
      p_metadata: { target: recipientId },
    });
    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : rpcError.message },
        { status: 500 }
      );
    }
  }

  const { data: msg, error } = await supabaseServer
    .from('messages')
    .insert({
      sender_id: user.id,
      recipient_id: recipientId,
      body: text.slice(0, 4000),
      subject,
      kind: 'request',
      conversation_key: key,
      read: false,
      metadata: { status: 'pending', fee_charged: fee },
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseServer.from('notifications').insert({
    user_id: recipientId,
    kind: 'message_request',
    title: 'New message request',
    body: fee > 0 ? `Someone paid ${fee} credits to message you` : 'You have a new message request',
    link: '/inbox?tab=requests',
    data: { message_id: msg.id, from: user.id, fee },
  });

  return NextResponse.json({ ok: true, status: 'pending', messageId: msg.id, feeCharged: fee });
}
