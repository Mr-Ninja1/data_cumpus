import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

const MAX_POSTS_PER_USER = 10;
const TEASER_LENGTH = 60;

// List a user's profile posts. Paid content is never sent to the browser
// unless the viewer owns the post or has already unlocked it — this is a
// server-enforced paywall, not just a UI overlay. Locked posts get a short
// teaser (not the full body) so there's something enticing to look at
// without leaking the paid content.
export async function GET(req: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('userId');
  if (!targetUserId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const viewer = await getAuthedUser(req);

  const { data, error } = await supabaseServer
    .from('profile_posts')
    .select('id, user_id, body, media_path, price_credits, created_at')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .limit(MAX_POSTS_PER_USER);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts = data || [];
  const isOwner = Boolean(viewer && viewer.id === targetUserId);

  let unlockedIds = new Set<string>();
  if (viewer && !isOwner && posts.some((p) => p.price_credits > 0)) {
    const { data: unlocks } = await supabaseServer
      .from('post_unlocks')
      .select('post_id')
      .eq('user_id', viewer.id)
      .in('post_id', posts.map((p) => p.id));
    unlockedIds = new Set((unlocks || []).map((u) => u.post_id));
  }

  return NextResponse.json({
    posts: posts.map((p) => {
      const unlocked = isOwner || p.price_credits === 0 || unlockedIds.has(p.id);
      const teaser = !unlocked && p.body ? p.body.slice(0, TEASER_LENGTH) : null;
      return {
        id: p.id,
        user_id: p.user_id,
        price_credits: p.price_credits,
        created_at: p.created_at,
        unlocked,
        is_owner: isOwner,
        body: unlocked ? p.body : null,
        media_path: unlocked ? p.media_path : null,
        teaser,
      };
    }),
    maxPosts: MAX_POSTS_PER_USER,
    postCount: posts.length,
  });
}

// Create a post on your own profile. No credits move here — money only
// moves when someone else pays to unlock it (see /unlock).
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existingPosts } = await supabaseServer
    .from('profile_posts')
    .select('id, media_path, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const posts = existingPosts || [];
  let evictedPostId: string | null = null;

  // Rolling window of MAX_POSTS_PER_USER: posting one more than the cap
  // evicts the oldest post (and its storage file, if any) instead of
  // blocking the user with an error.
  if (posts.length >= MAX_POSTS_PER_USER) {
    const oldest = posts[0];
    evictedPostId = oldest.id;
    if (oldest.media_path) {
      await supabaseServer.storage.from('profile_posts').remove([oldest.media_path]).catch(() => {});
    }
    await supabaseServer.from('profile_posts').delete().eq('id', oldest.id);
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : '';
  const mediaPath = typeof body.mediaPath === 'string' ? body.mediaPath : null;
  const priceCredits = Math.max(0, Math.floor(Number(body.priceCredits || 0)));

  if (!text && !mediaPath) {
    return NextResponse.json({ error: 'Add some text or a photo first' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('profile_posts')
    .insert({ user_id: user.id, body: text || null, media_path: mediaPath, price_credits: priceCredits })
    .select('id, user_id, body, media_path, price_credits, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message.includes('profile_posts') ? 'Run social_economy.sql in Supabase first' : error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    post: { ...data, unlocked: true, is_owner: true, teaser: null },
    postCount: Math.min(posts.length + 1, MAX_POSTS_PER_USER),
    maxPosts: MAX_POSTS_PER_USER,
    evictedPostId,
  });
}
