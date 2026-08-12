

create table if not exists public.wallets (
  user_id uuid not null,
  balance_credits integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint wallets_pkey primary key (user_id),
  constraint wallets_balance_nonneg check (balance_credits >= 0)
);

create table if not exists public.credit_packages (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  credits integer not null,
  price_cents integer not null,
  currency text not null default 'ZMW',
  is_active boolean not null default true,
  is_popular boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint credit_packages_pkey primary key (id),
  constraint credit_packages_slug_unique unique (slug)
);

insert into public.credit_packages (slug, name, credits, price_cents, currency, is_popular, sort_order)
values
  ('starter', 'Starter Pack', 20, 1000, 'ZMW', false, 1),
  ('pro', 'Pro Student Pack', 60, 2500, 'ZMW', true, 2),
  ('final-year', 'Final Year Prep', 150, 5000, 'ZMW', false, 3)
on conflict (slug) do update set
  name = excluded.name,
  credits = excluded.credits,
  price_cents = excluded.price_cents,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order;

create table if not exists public.wallet_transactions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  credits_delta integer not null,
  cash_amount_cents integer,
  currency text default 'ZMW',
  status text not null default 'completed',
  provider text,
  reference text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint wallet_transactions_pkey primary key (id),
  constraint wallet_transactions_kind_check
    check (kind in ('deposit', 'spend', 'refund', 'bonus', 'adjustment')),
  constraint wallet_transactions_status_check
    check (status in ('pending', 'completed', 'failed', 'reversed'))
);

create index if not exists wallet_transactions_user_idx
  on public.wallet_transactions (user_id, created_at desc);

create table if not exists public.deposit_requests (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  package_id uuid references public.credit_packages (id),
  provider text not null,
  phone_number text,
  reference text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint deposit_requests_pkey primary key (id),
  constraint deposit_requests_status_check
    check (status in ('pending', 'completed', 'failed', 'cancelled'))
);

create index if not exists deposit_requests_user_idx
  on public.deposit_requests (user_id, created_at desc);

-- Ensure wallet row on signup (call from app or trigger later)
create or replace function public.ensure_wallet(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id, balance_credits)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_wallet(uuid) from public;
grant execute on function public.ensure_wallet(uuid) to authenticated;

create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform public.ensure_wallet(p_user_id);

  select balance_credits into v_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance < p_amount then
    raise exception 'insufficient credits';
  end if;

  update public.wallets
  set
    balance_credits = balance_credits - p_amount,
    lifetime_spent = lifetime_spent + p_amount,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id, kind, credits_delta, status, description, metadata
  )
  values (
    p_user_id, 'spend', -p_amount, 'completed', p_description, p_metadata
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke all on function public.consume_credits(uuid, integer, text, jsonb) from public;
grant execute on function public.consume_credits(uuid, integer, text, jsonb) to service_role;

create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_kind text,
  p_description text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  perform public.ensure_wallet(p_user_id);

  update public.wallets
  set
    balance_credits = balance_credits + p_amount,
    lifetime_purchased = lifetime_purchased + case when p_kind = 'deposit' then p_amount else lifetime_purchased end,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id, kind, credits_delta, status, description, metadata
  )
  values (
    p_user_id, p_kind, p_amount, 'completed', p_description, p_metadata
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke all on function public.add_credits(uuid, integer, text, text, jsonb) from public;
grant execute on function public.add_credits(uuid, integer, text, text, jsonb) to service_role;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.credit_packages enable row level security;
alter table public.deposit_requests enable row level security;

drop policy if exists "Users read own wallet" on public.wallets;
create policy "Users read own wallet"
  on public.wallets for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Users read own transactions" on public.wallet_transactions;
create policy "Users read own transactions"
  on public.wallet_transactions for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Anyone read active packages" on public.credit_packages;
create policy "Anyone read active packages"
  on public.credit_packages for select
  using (is_active = true or public.is_staff(auth.uid()));

drop policy if exists "Users read own deposits" on public.deposit_requests;
create policy "Users read own deposits"
  on public.deposit_requests for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Users insert own deposits" on public.deposit_requests;
create policy "Users insert own deposits"
  on public.deposit_requests for insert
  with check (auth.uid() = user_id);
