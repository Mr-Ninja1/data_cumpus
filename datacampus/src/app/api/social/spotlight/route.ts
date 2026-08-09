import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

const DEFAULT_COST_PER_IMPRESSION = 2;
const RAIL_SIZE = 6;

// "Spotlight" — pay credits for genuine visibility in the homepage
// Discover rail. Deliberately NOT a "pay people to follow you" scheme:
// nobody is paid to engage, you're just buying real ad placement in front
// of real browsing students. 100% of the spend goes to the platform
// treasury (if one is configured) since there's no peer being paid.
export async function GET(req: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }
  const client = supabaseServer;

  const { data: campaigns, error } = await client
    .from('spotlight_campaigns')
    .select('id, buyer_id, impressions_target, impressions_served, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(RAIL_SIZE);

  if (error) {
    return NextResponse.json({
      error: error.message.includes('spotlight_campaigns') ? 'Run social_economy_v2.sql in Supabase first' : error.message,
    }, { status: 500 });
  }

  const rows = campaigns || [];
  if (!rows.length) {
    return NextResponse.json({ profiles: [] });
  }

  const buyerIds = [...new Set(rows.map((c) => c.buyer_id))];
  const { data: profiles } = await client
    .from('profiles')
    .select('id, display_name, role, is_verified')
    .in('id', buyerIds);
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  // Best-effort impression counting — a soft engagement metric, not money,
  // so we don't need row-locking here.
  const toComplete: string[] = [];
  for (const c of rows) {
    const nextServed = c.impressions_served + 1;
    if (nextServed >= c.impressions_target) {
      toComplete.push(c.id);
    }
  }
  // Increment each row individually since Supabase's client can't do a
  // relative `+1` update across multiple differing rows in one call.
  await Promise.all(
    rows.map((c) =>
      client
        .from('spotlight_campaigns')
        .update({ impressions_served: c.impressions_served + 1 })
        .eq('id', c.id)
    )
  );
  if (toComplete.length) {
    await client.from('spotlight_campaigns').update({ status: 'completed' }).in('id', toComplete);
  }

  return NextResponse.json({
    profiles: rows
      .map((c) => {
        const p = profileMap.get(c.buyer_id);
        if (!p) return null;
        return { id: p.id, displayName: p.display_name, role: p.role, isVerified: p.is_verified };
      })
      .filter(Boolean),
  });
}

// Buy a Spotlight campaign for your own profile.
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const impressionsTarget = Math.floor(Number(body.impressionsTarget || 0));
  if (!Number.isFinite(impressionsTarget) || impressionsTarget <= 0 || impressionsTarget > 5000) {
    return NextResponse.json({ error: 'Pick a valid number of impressions (1-5000)' }, { status: 400 });
  }

  const { data: settings } = await supabaseServer
    .from('platform_settings')
    .select('treasury_user_id, spotlight_credits_per_impression')
    .eq('id', true)
    .maybeSingle();

  const costPerImpression = settings?.spotlight_credits_per_impression ?? DEFAULT_COST_PER_IMPRESSION;
  const totalCost = impressionsTarget * costPerImpression;
  const treasuryId = settings?.treasury_user_id;

  if (!treasuryId) {
    return NextResponse.json(
      { error: 'Spotlight is not configured yet — ask an admin to set platform_settings.treasury_user_id.' },
      { status: 503 }
    );
  }

  const { error: rpcError } = await supabaseServer.rpc('wallet_transfer', {
    p_from: user.id,
    p_to: treasuryId,
    p_amount: totalCost,
    p_fee_bps: 0,
    p_kind: 'spotlight_purchase',
    p_metadata: { impressions_target: impressionsTarget },
    p_count_as_earning: false,
  });

  if (rpcError) {
    if (rpcError.message.includes('insufficient_credits')) {
      return NextResponse.json({ error: `You need ${totalCost} credits for ${impressionsTarget} impressions` }, { status: 402 });
    }
    return NextResponse.json(
      { error: rpcError.message.includes('wallet_transfer') ? 'Run social_economy_v2.sql in Supabase first' : rpcError.message },
      { status: 500 }
    );
  }

  const { data: campaign, error } = await supabaseServer
    .from('spotlight_campaigns')
    .insert({
      buyer_id: user.id,
      impressions_target: impressionsTarget,
      impressions_served: 0,
      credits_spent: totalCost,
      status: 'active',
    })
    .select('id, impressions_target, credits_spent, status, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message.includes('spotlight_campaigns') ? 'Run social_economy_v2.sql in Supabase first' : error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, campaign, costPerImpression, totalCost });
}
