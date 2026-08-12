-- Social economy v3
-- Safe to re-run.
-- Adds conversation clears + ephemeral cleanup for local-first messaging.

create table if not exists public.conversation_clears (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_key text not null,
  cleared_before timestamp with time zone not null default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint conversation_clears_pkey primary key (user_id, conversation_key)
);

create index if not exists conversation_clears_user_idx
  on public.conversation_clears (user_id, cleared_before desc);

alter table public.conversation_clears enable row level security;

drop policy if exists "Owners read clears" on public.conversation_clears;
create policy "Owners read clears"
  on public.conversation_clears for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Owners upsert clears" on public.conversation_clears;
create policy "Owners upsert clears"
  on public.conversation_clears for insert
  with check (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Owners update clears" on public.conversation_clears;
create policy "Owners update clears"
  on public.conversation_clears for update
  using (auth.uid() = user_id or public.is_staff(auth.uid()))
  with check (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Owners delete clears" on public.conversation_clears;
create policy "Owners delete clears"
  on public.conversation_clears for delete
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

create or replace function public.touch_conversation_clears_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_conversation_clears_updated_at on public.conversation_clears;
create trigger trg_conversation_clears_updated_at
before update on public.conversation_clears
for each row execute function public.touch_conversation_clears_updated_at();

create or replace function public.dc_cleanup_ephemeral_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- DM envelopes are transport only. Delivered ones are deleted in app code;
  -- this catches undelivered leftovers and any stale rows from older builds.
  delete from public.messages
  where kind = 'dm'
    and created_at < timezone('utc'::text, now()) - interval '72 hours';

  -- Keep accepted requests as the lightweight permission ledger for DMs.
  delete from public.chat_requests
  where status in ('declined', 'cancelled')
    and coalesce(responded_at, created_at) < timezone('utc'::text, now()) - interval '30 days';

  delete from public.chat_requests
  where status = 'pending'
    and created_at < timezone('utc'::text, now()) - interval '14 days';

  -- Conversation clear markers can be pruned after long inactivity.
  delete from public.conversation_clears
  where cleared_before < timezone('utc'::text, now()) - interval '180 days';
end;
$$;

revoke all on function public.dc_cleanup_ephemeral_data() from public;
grant execute on function public.dc_cleanup_ephemeral_data() to authenticated;
