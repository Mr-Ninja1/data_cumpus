import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Pay-to-view: atomically transfers `price_credits` from the viewer to the
// poster (minus the platform's creator-economy cut), and records the
// unlock so this viewer can see it for free from now on.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: post, error: postErr } = await supabaseServer
    .from('profile_posts')
    .select('id, user_id, body, media_path, price_credits')
    .eq('id', id)
    .maybeSingle();
  if (postErr || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.user_id === user.id) {
    return NextResponse.json({ ok: true, post: { ...post, unlocked: true, is_owner: true } });
  }

  if (post.price_credits <= 0) {
    return NextResponse.json({ ok: true, post: { ...post, unlocked: true, is_owner: false } });
  }

  const { data: existingUnlock } = await supabaseServer
    .from('post_unlocks')
    .select('id')
    .eq('post_id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingUnlock) {
    return NextResponse.json({ ok: true, post: { ...post, unlocked: true, is_owner: false } });
  }

  const price = post.price_credits;

  const { data: settings } = await supabaseServer
    .from('platform_settings')
    .select('post_unlock_fee_bps')
    .eq('id', true)
    .maybeSingle();
  const feeBps = settings?.post_unlock_fee_bps ?? 2000;

  const { error: rpcError } = await supabaseServer.rpc('wallet_transfer', {
    p_from: user.id,
    p_to: post.user_id,
    p_amount: price,
    p_fee_bps: feeBps,
    p_kind: 'post_unlock',
    p_metadata: { post_id: id },
  });

  if (rpcError) {
    if (rpcError.message.includes('insufficient_credits')) {
      return NextResponse.json({ error: 'Insufficient credits to unlock this post' }, { status: 402 });
    }
    return NextResponse.json(
      { error: rpcError.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : rpcError.message },
      { status: 500 }
    );
  }

  const { error: unlockErr } = await supabaseServer
    .from('post_unlocks')
    .insert({ post_id: id, user_id: user.id, credits_paid: price });
  if (unlockErr) {
    return NextResponse.json({ error: unlockErr.message }, { status: 500 });
  }

  await supabaseServer.from('notifications').insert({
    user_id: post.user_id,
    kind: 'post_unlocked',
    title: 'Someone unlocked your post',
    body: `You earned credits from a post unlock`,
    link: '/wallet',
    data: { post_id: id, from: user.id, price },
  });

  return NextResponse.json({ ok: true, post: { ...post, unlocked: true, is_owner: false } });
}
