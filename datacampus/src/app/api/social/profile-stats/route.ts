import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

// Public "reputation" score for a profile — a fun, gamified stat, not a
// literal balance leak. Formula: wallet balance + lifetime earnings +
// (followers * 5). Respects the profile owner's `show_reputation` toggle
// (default on) — if they've turned it off, we just return null so no
// financial data is exposed for that profile.
export async function GET(req: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const [{ data: profile }, { data: wallet }, { count: followers }, { count: following }] = await Promise.all([
    supabaseServer.from('profiles').select('lifetime_earnings, show_reputation').eq('id', userId).maybeSingle(),
    supabaseServer.from('wallets').select('balance_credits').eq('user_id', userId).maybeSingle(),
    supabaseServer.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    supabaseServer.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);

  const showReputation = profile?.show_reputation ?? true;
  const followerCount = followers ?? 0;
  const followingCount = following ?? 0;

  if (!showReputation) {
    return NextResponse.json({
      reputation: null,
      followers: followerCount,
      following: followingCount,
      showReputation: false,
    });
  }

  const balance = wallet?.balance_credits ?? 0;
  const lifetimeEarnings = profile?.lifetime_earnings ?? 0;
  const reputation = balance + lifetimeEarnings + followerCount * 5;

  return NextResponse.json({
    reputation,
    followers: followerCount,
    following: followingCount,
    showReputation: true,
  });
}
