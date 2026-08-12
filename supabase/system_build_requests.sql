-- System build requests (done-for-you service inside Work)
-- Safe to re-run.
-- Requires: profiles, wave_c (is_staff).

create table if not exists public.system_build_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  department text null,
  deadline date null,
  budget_feel text not null default 'flexible'
    check (budget_feel in ('low', 'medium', 'flexible')),
  status text not null default 'sent'
    check (status in ('sent', 'quoted', 'in_progress', 'done', 'cancelled')),
  admin_notes text null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists system_build_requests_user_idx
  on public.system_build_requests (user_id, created_at desc);

create index if not exists system_build_requests_status_idx
  on public.system_build_requests (status, created_at desc);

alter table public.system_build_requests enable row level security;

drop policy if exists "Students read own system requests" on public.system_build_requests;
create policy "Students read own system requests"
  on public.system_build_requests for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Students insert own system requests" on public.system_build_requests;
create policy "Students insert own system requests"
  on public.system_build_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "Staff update system requests" on public.system_build_requests;
create policy "Staff update system requests"
  on public.system_build_requests for update
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

comment on table public.system_build_requests is
  'Student requests for custom system/app builds handled by campus staff.';
