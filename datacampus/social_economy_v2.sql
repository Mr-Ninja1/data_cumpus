-- Run this AFTER social_economy.sql, in the Supabase SQL editor.
--
-- This migration fixes a real correctness issue in the v1 credit routes:
-- they read a wallet balance, then wrote a new balance back in a separate
-- statement, which is vulnerable to a race condition under concurrent
-- requests (two simultaneous spends/transfers can both read the same
-- starting balance and clobber each other, effectively creating or
-- destroying credits). Every credit movement now goes through the
-- `wallet_transfer` function below, which runs as a single atomic
-- Postgres transaction with row locking.
--
-- It also adds: lifetime earnings tracking, pinned/reputation fields for
-- the People directory, a configurable platform-fee table (creator-economy
-- cuts only — peer-to-peer gifts are 0% by default, see notes below), and
-- a "Spotlight" paid-visibility feature (replacing a literal "pay people to
-- follow you" marketplace, which would just incentivize fake engagement).

-- 1) Profile additions -----------------------------------------------------

alter table public.profiles add column if not exists lifetime_earnings bigint not null default 0;
alter table public.profiles add column if not exists is_pinned boolean not null default false;
alter table public.profiles add column if not exists show_reputation boolean not null default true;

-- 2) Platform settings (singleton row) -------------------------------------
-- One designated account collects platform fees. Fees only apply to
-- creator-economy interactions (post unlocks, follow fees, message fees)
-- — NOT to plain peer-to-peer transfers, which stay 100% liquid by default
-- (p2p_fee_bps starts at 0; raise it later if you want a cut of gifting).
-- bps = basis points, e.g. 2000 = 20.00%.

create table if not exists public.platform_settings (
  id boolean primary key default true,
  treasury_user_id uuid references auth.users(id),
  post_unlock_fee_bps int not null default 2000,
  follow_fee_bps int not null default 1500,
  message_fee_bps int not null default 1500,
  p2p_fee_bps int not null default 0,
  spotlight_credits_per_impression int not null default 2,
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- IMPORTANT — one-time manual step: point the treasury at your own
-- (owner) account so platform fees have somewhere to land. Until you run
-- this, fees are automatically skipped (recipients simply get 100%) —
-- nothing breaks, you just don't collect a cut yet.
--   update public.platform_settings
--   set treasury_user_id = '<your-owner-user-uuid>'
--   where id = true;

-- 3) The atomic credit-movement primitive ----------------------------------
-- Used by every route that moves credits between two wallets, optionally
-- skimming a platform fee (in basis points) to the treasury account.
-- fee_bps = 0 means the full amount goes to the recipient (plain P2P,
-- refunds, reversals). Returns the sender's new balance and how much fee
-- (if any) was actually collected.

create or replace function public.wallet_transfer(
  p_from uuid,
  p_to uuid,
  p_amount int,
  p_fee_bps int default 0,
  p_kind text default 'transfer',
  p_metadata jsonb default '{}'::jsonb,
  p_count_as_earning boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_treasury uuid;
  v_fee int := 0;
  v_recipient_share int;
  v_from_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  if p_from = p_to then
    raise exception 'cannot_transfer_to_self';
  end if;

  insert into public.wallets (user_id, balance_credits) values (p_from, 0) on conflict (user_id) do nothing;
  insert into public.wallets (user_id, balance_credits) values (p_to, 0) on conflict (user_id) do nothing;

  -- Lock the payer's row first so concurrent spends can't both read a
  -- stale balance.
  select balance_credits into v_from_balance from public.wallets where user_id = p_from for update;
  if v_from_balance < p_amount then
    raise exception 'insufficient_credits';
  end if;

  if p_fee_bps > 0 then
    select treasury_user_id into v_treasury from public.platform_settings where id = true;
    if v_treasury is not null and v_treasury <> p_from and v_treasury <> p_to then
      v_fee := (p_amount * p_fee_bps) / 10000;
    end if;
  end if;
  v_recipient_share := p_amount - v_fee;

  update public.wallets
    set balance_credits = balance_credits - p_amount, updated_at = now()
    where user_id = p_from;

  perform 1 from public.wallets where user_id = p_to for update;
  update public.wallets
    set balance_credits = balance_credits + v_recipient_share, updated_at = now()
    where user_id = p_to;
  if p_count_as_earning then
    update public.profiles set lifetime_earnings = lifetime_earnings + v_recipient_share where id = p_to;
  end if;

  insert into public.wallet_transactions (user_id, kind, credits_delta, cash_amount, currency, status, provider, metadata)
  values (p_from, p_kind || '_out', -p_amount, 0, 'TZS', 'completed', 'internal', p_metadata || jsonb_build_object('to', p_to));

  insert into public.wallet_transactions (user_id, kind, credits_delta, cash_amount, currency, status, provider, metadata)
  values (p_to, p_kind || '_in', v_recipient_share, 0, 'TZS', 'completed', 'internal', p_metadata || jsonb_build_object('from', p_from));

  if v_fee > 0 then
    perform 1 from public.wallets where user_id = v_treasury for update;
    update public.wallets
      set balance_credits = balance_credits + v_fee, updated_at = now()
      where user_id = v_treasury;
    update public.profiles set lifetime_earnings = lifetime_earnings + v_fee where id = v_treasury;

    insert into public.wallet_transactions (user_id, kind, credits_delta, cash_amount, currency, status, provider, metadata)
    values (v_treasury, 'platform_fee', v_fee, 0, 'TZS', 'completed', 'internal',
      p_metadata || jsonb_build_object('from', p_from, 'to', p_to, 'source_kind', p_kind));
  end if;

  return jsonb_build_object(
    'from_balance', v_from_balance - p_amount,
    'fee_charged', v_fee,
    'recipient_share', v_recipient_share
  );
end;
$$;

-- 4) Spotlight — paid, genuine visibility (replaces a "buy followers"
--    marketplace, which would just incentivize fake engagement/spam).
--    A student pays credits for their profile to appear in a real
--    "Discover" rail shown to actual browsing students. 100% of the spend
--    goes to the treasury — it's advertising spend, not a payout to a peer,
--    so there's no creator split to compute.

create table if not exists public.spotlight_campaigns (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  impressions_target int not null,
  impressions_served int not null default 0,
  credits_spent int not null default 0,
  status text not null default 'active', -- 'active' | 'completed'
  created_at timestamptz default timezone('utc'::text, now())
);

create index if not exists spotlight_campaigns_status_idx on public.spotlight_campaigns (status, created_at desc);

alter table public.spotlight_campaigns enable row level security;

drop policy if exists "spotlight_select_all" on public.spotlight_campaigns;
create policy "spotlight_select_all" on public.spotlight_campaigns
  for select using (true);
-- Inserts/impression updates go through the server (service role) since
-- purchasing moves credits and impression counting should be trustworthy.

-- 5) Realtime — lets the client show a toast the instant you earn credits
--    (post unlock, follow fee, message fee, transfer, spotlight, etc).
--    Safe to re-run if already added.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_transactions'
  ) then
    alter publication supabase_realtime add table public.wallet_transactions;
  end if;
end $$;
