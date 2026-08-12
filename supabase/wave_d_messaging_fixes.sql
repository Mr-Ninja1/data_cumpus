-- Wave D: messaging fixes
-- 1) Expand messages kind check to allow 'request' (social message-request flow)
-- 2) Ensure conversation_clears exists (idempotent, already in social_economy_v3.sql)

-- Drop the old check and add expanded one
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'messages_kind_check'
  ) then
    alter table public.messages drop constraint messages_kind_check;
  end if;

  alter table public.messages
    add constraint messages_kind_check check (kind in ('dm', 'support', 'staff', 'request'));
end $$;

-- Expand wallet_transactions kind check for social economy transfer kinds
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'wallet_transactions_kind_check'
  ) then
    alter table public.wallet_transactions drop constraint wallet_transactions_kind_check;
  end if;

  alter table public.wallet_transactions
    add constraint wallet_transactions_kind_check check (kind in (
      'deposit', 'spend', 'refund', 'bonus', 'adjustment',
      'transfer_out', 'transfer_in',
      'follow_fee_out', 'follow_fee_in',
      'message_request_fee_out', 'message_request_fee_in',
      'post_unlock_out', 'post_unlock_in',
      'spotlight_purchase',
      'platform_fee'
    ));
end $$;

-- social_economy_v2 uses `cash_amount` (integer) but wallet.sql defines `cash_amount_cents`.
-- Add the alias column if it doesn't exist so both work.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_transactions' and column_name = 'cash_amount'
  ) then
    alter table public.wallet_transactions add column cash_amount integer default 0;
  end if;
end $$;
