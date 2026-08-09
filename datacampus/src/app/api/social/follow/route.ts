import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Server-side follow so a "follow fee" (if the target has set one) can be
// enforced honestly and split atomically with the platform, and blocked
// users can't follow each other.
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const followingId = typeof body.followingId === 'string' ? body.followingId : null;
  if (!followingId || followingId === user.id) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  }

  const { data: blocked } = await supabaseServer
    .from('blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${followingId}),and(blocker_id.eq.${followingId},blocked_id.eq.${user.id})`
    )
    .maybeSingle();
  if (blocked) {
    return NextResponse.json({ error: 'You cannot follow this user' }, { status: 403 });
  }

  const { data: existing } = await supabaseServer
    .from('follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', followingId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, alreadyFollowing: true, feeCharged: 0 });
  }

  const { data: targetProfile, error: profileErr } = await supabaseServer
    .from('profiles')
    .select('id, display_name, follow_fee_credits')
    .eq('id', followingId)
    .maybeSingle();
  if (profileErr || !targetProfile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const fee = Math.max(0, Math.floor(targetProfile.follow_fee_credits || 0));

  if (fee > 0) {
    const { data: settings } = await supabaseServer
      .from('platform_settings')
      .select('follow_fee_bps')
      .eq('id', true)
      .maybeSingle();
    const feeBps = settings?.follow_fee_bps ?? 1500;

    const { data: result, error } = await supabaseServer.rpc('wallet_transfer', {
      p_from: user.id,
      p_to: followingId,
      p_amount: fee,
      p_fee_bps: feeBps,
      p_kind: 'follow_fee',
      p_metadata: { target: followingId },
    });

    if (error) {
      if (error.message.includes('insufficient_credits')) {
        return NextResponse.json(
          { error: `${targetProfile.display_name || 'This user'} charges ${fee} credits to follow. Top up your wallet first.` },
          { status: 402 }
        );
      }
      return NextResponse.json(
        { error: error.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : error.message },
        { status: 500 }
      );
    }
    void result;
  }

  const { error: insertErr } = await supabaseServer
    .from('follows')
    .insert({ follower_id: user.id, following_id: followingId });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { data: senderProfile } = await supabaseServer
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const name = senderProfile?.display_name || 'Someone';

  await supabaseServer.from('notifications').insert({
    user_id: followingId,
    kind: 'new_follower',
    title: 'New subscriber',
    body: fee > 0 ? `${name} paid ${fee} credits to subscribe to your channel` : `${name} subscribed to your channel`,
    link: `/u/${user.id}`,
    data: { follower_id: user.id, fee },
  });

  return NextResponse.json({ ok: true, feeCharged: fee });
}
