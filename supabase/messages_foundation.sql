-- Wave D — messaging foundation (inbox for everyone)
-- Safe to re-run.
-- Requires: profiles, wave_c (is_staff).
-- Existing public.messages table is upgraded in place.

-- Ensure core columns exist (table may already be present from messages.sql)
create table if not exists public.messages (
  id uuid not null default gen_random_uuid (),
  recipient_id uuid not null,
  sender_id uuid null,
  subject text null,
  body text null,
  read boolean null default false,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint messages_pkey primary key (id)
);

alter table public.messages
  add column if not exists conversation_key text;

alter table public.messages
  add column if not exists kind text not null default 'dm';

-- Soft constraints (idempotent via drop/add not needed for check — skip if fragile)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_kind_check'
  ) then
    alter table public.messages
      add constraint messages_kind_check check (kind in ('dm', 'support', 'staff'));
  end if;
end $$;

create index if not exists messages_recipient_idx
  on public.messages using btree (recipient_id);

create index if not exists messages_sender_idx
  on public.messages using btree (sender_id);

create index if not exists messages_conversation_idx
  on public.messages using btree (conversation_key, created_at desc);

create index if not exists messages_unread_idx
  on public.messages using btree (recipient_id, read);

-- Helper: stable conversation key for two users
create or replace function public.conversation_key_for(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select case
    when a::text < b::text then a::text || ':' || b::text
    else b::text || ':' || a::text
  end;
$$;

revoke all on function public.conversation_key_for(uuid, uuid) from public;
grant execute on function public.conversation_key_for(uuid, uuid) to authenticated;
grant execute on function public.conversation_key_for(uuid, uuid) to anon;

alter table public.messages enable row level security;

drop policy if exists "Participants read own messages" on public.messages;
create policy "Participants read own messages"
  on public.messages for select
  using (
    auth.uid() = recipient_id
    or auth.uid() = sender_id
    or public.is_staff(auth.uid())
  );

drop policy if exists "Users send messages as self" on public.messages;
create policy "Users send messages as self"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and recipient_id is not null
    and sender_id <> recipient_id
  );

drop policy if exists "Recipients mark read" on public.messages;
create policy "Recipients mark read"
  on public.messages for update
  using (
    auth.uid() = recipient_id
    or public.is_staff(auth.uid())
  )
  with check (
    auth.uid() = recipient_id
    or public.is_staff(auth.uid())
  );

-- Admin audit readable by staff
alter table public.admin_audit enable row level security;

drop policy if exists "Staff read audit" on public.admin_audit;
create policy "Staff read audit"
  on public.admin_audit for select
  using (public.is_staff(auth.uid()));

drop policy if exists "Staff insert audit" on public.admin_audit;
create policy "Staff insert audit"
  on public.admin_audit for insert
  with check (public.is_staff(auth.uid()));
