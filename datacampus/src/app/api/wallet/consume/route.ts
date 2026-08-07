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
  const amount = Number(body.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const { data: walletData, error: walletError } = await supabaseServer
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (walletError) {
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  const currentBalance = walletData?.balance_credits ?? 0;
  if (currentBalance < amount) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
  }

  const nextBalance = currentBalance - amount;
  const { error: updateError } = await supabaseServer
    .from('wallets')
    .upsert({ user_id: user.id, balance_credits: nextBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: txError } = await supabaseServer.from('wallet_transactions').insert({
    user_id: user.id,
    kind: 'spend',
    credits_delta: -amount,
    cash_amount: 0,
    currency: 'TZS',
    status: 'completed',
    provider: 'internal',
    reference: body.reference || null,
    metadata: { reason: body.reason || 'ai-action' },
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, balance: nextBalance });
}
