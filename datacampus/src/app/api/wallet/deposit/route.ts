import { NextRequest, NextResponse } from 'next/server';
import { getAuthedUser } from '@/utils/serverAuth';
import { supabaseServer } from '@/utils/supabaseServerClient';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user || !supabaseServer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const packageId = body.packageId || null;
  const credits = Number(body.credits || 0);
  const provider = body.provider || 'manual';

  if (!packageId && credits <= 0) {
    return NextResponse.json({ error: 'Invalid deposit request' }, { status: 400 });
  }

  const amount = credits > 0 ? credits : 0;
  const { data: walletData, error: walletError } = await supabaseServer
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  const nextWallet = walletData ?? { user_id: user.id, balance_credits: 0 };
  const newBalance = (nextWallet.balance_credits || 0) + amount;

  const { data: wallet, error: saveError } = await supabaseServer
    .from('wallets')
    .upsert({ user_id: user.id, balance_credits: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  const { error: txError } = await supabaseServer.from('wallet_transactions').insert({
    user_id: user.id,
    kind: 'deposit',
    credits_delta: amount,
    cash_amount_cents: 0,
    currency: 'ZMW',
    status: 'completed',
    provider,
    reference: body.reference || null,
    description: 'manual-deposit',
    metadata: { packageId, source: 'manual-deposit' },
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  await supabaseServer.from('deposit_requests').insert({
    user_id: user.id,
    package_id: packageId,
    provider,
    phone_number: body.phoneNumber || null,
    reference: body.reference || null,
    status: 'completed',
    metadata: { credits: amount },
  });

  return NextResponse.json({ wallet, deposited: amount });
}
