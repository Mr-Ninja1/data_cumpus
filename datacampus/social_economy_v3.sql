-- Run this AFTER social_economy.sql and social_economy_v2.sql.
--
-- Resource-optimization pass: keeps the hot tables fast and prunes truly
-- disposable rows, WITHOUT deleting real chat history (see the note in
-- the project chat/PR notes on why full "delete after delivery" ephemeral
-- messaging was rejected — it requires a client-side local database this
-- web app doesn't have, and breaks the message-fee "are we already
-- connected?" check, which relies on prior message history existing).

-- 1) Indexes for the hot paths --------------------------------------------

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_key, created_at desc);

create index if not exists messages_recipient_unread_idx
  on public.messages (recipient_id, read)
  where read = false;

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create index if not exists profile_posts_user_created_idx
  on public.profile_posts (user_id, created_at desc);

-- 2) "Clear chat" (delete-for-me) ------------------------------------------
-- A user can hide everything before a timestamp in a given conversation,
-- for their own view only — the other participant's copy is untouched.
-- Safe for direct client access since a user can only ever touch their
-- own row.

create table if not exists public.conversation_clears (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_key text not null,
  cleared_before timestamptz not null default now(),
  primary key (user_id, conversation_key)
);

alter table public.conversation_clears enable row level security;

drop policy if exists "conversation_clears_own" on public.conversation_clears;
create policy "conversation_clears_own" on public.conversation_clears
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Cleanup of genuinely disposable rows -----------------------------------
-- Declined/blocked message REQUESTS are rejected contact attempts, not
-- real conversations — safe to prune. Completed Spotlight campaigns keep
-- their financial record permanently in wallet_transactions even after
-- the campaign row itself is pruned, so nothing of value is lost.

create or replace function public.dc_cleanup_ephemeral_data() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.messages
  where kind = 'request'
    and (metadata->>'status') in ('declined', 'blocked')
    and created_at < now() - interval '30 days';

  delete from public.spotlight_campaigns
  where status = 'completed'
    and created_at < now() - interval '30 days';

  delete from public.conversation_clears
  where cleared_before < now() - interval '365 days';
end;
$$;

-- Auto-schedule it if the pg_cron extension is enabled on this project
-- (Supabase dashboard → Database → Extensions). If it's not enabled,
-- nothing breaks here — call POST /api/admin/maintenance/cleanup on a
-- schedule instead (e.g. a Vercel Cron Job), which runs the same function.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dc-cleanup-ephemeral-data', '0 3 * * *', 'select public.dc_cleanup_ephemeral_data();');
  end if;
end $$;
