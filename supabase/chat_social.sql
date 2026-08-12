-- Chat social layer: requests + contact search indexes
-- Safe to re-run. Requires: profiles, messages_foundation, wave_c (is_staff).
-- Lean DB: requests are tiny rows; full DM bodies stay device-local after claim.

create extension if not exists pg_trgm;

create table if not exists public.chat_requests (
  id uuid not null default gen_random_uuid(),
  kind text not null default 'dm',
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid null,
  message text null,
  status text not null default 'pending',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  responded_at timestamp with time zone null,
  metadata jsonb not null default '{}'::jsonb,
  constraint chat_requests_pkey primary key (id),
  constraint chat_requests_kind_check check (kind in ('dm', 'group')),
  constraint chat_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint chat_requests_not_self check (from_user_id <> to_user_id)
);

create index if not exists chat_requests_to_pending_idx
  on public.chat_requests (to_user_id, status, created_at desc);

create index if not exists chat_requests_from_idx
  on public.chat_requests (from_user_id, status, created_at desc);

create index if not exists chat_requests_pair_idx
  on public.chat_requests (from_user_id, to_user_id, kind);

create unique index if not exists chat_requests_pending_dm_unique
  on public.chat_requests (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id),
    kind
  )
  where status = 'pending' and kind = 'dm';

alter table public.chat_requests enable row level security;

drop policy if exists "Participants read chat requests" on public.chat_requests;
create policy "Participants read chat requests"
  on public.chat_requests for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or public.is_staff(auth.uid())
  );

drop policy if exists "Users create chat requests" on public.chat_requests;
create policy "Users create chat requests"
  on public.chat_requests for insert
  with check (
    auth.uid() = from_user_id
    and from_user_id <> to_user_id
  );

drop policy if exists "Participants update chat requests" on public.chat_requests;
create policy "Participants update chat requests"
  on public.chat_requests for update
  using (
    auth.uid() = to_user_id
    or auth.uid() = from_user_id
    or public.is_staff(auth.uid())
  )
  with check (
    auth.uid() = to_user_id
    or auth.uid() = from_user_id
    or public.is_staff(auth.uid())
  );

create index if not exists profiles_student_id_lookup_idx
  on public.profiles (student_id);

do $$
begin
  create index if not exists profiles_display_name_trgm_idx
    on public.profiles using gin (display_name gin_trgm_ops);
  create index if not exists profiles_full_name_trgm_idx
    on public.profiles using gin (full_name gin_trgm_ops);
  create index if not exists profiles_student_id_trgm_idx
    on public.profiles using gin (student_id gin_trgm_ops);
exception when others then
  null;
end $$;
