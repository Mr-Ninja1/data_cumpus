-- Seed 10 test credits for every existing user/profile.
-- Safe to run multiple times in development because it only tops up users
-- whose wallet balance is currently below 10 credits.

with target_users as (
  select p.id as user_id
  from public.profiles p
), seeded as (
  select
    tu.user_id,
    greatest(10 - coalesce(w.balance_credits, 0), 0) as amount_to_add
  from target_users tu
  left join public.wallets w on w.user_id = tu.user_id
)
select public.add_credits(
  s.user_id,
  s.amount_to_add,
  'bonus',
  'Seed 10 test credits for proposal workflow testing',
  jsonb_build_object('seed', 'test_wallet_credits', 'target_balance', 10)
)
from seeded s
where s.amount_to_add > 0;
