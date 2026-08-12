-- Wave B: uploader credit + moderation RLS
-- Run this in the Supabase SQL editor when ready.
-- Reminder: also set at least one admin, e.g.
--   update public.profiles set role = 'admin' where id = '<your-user-uuid>';

-- 1) Credit uploaders on live papers
alter table public.papers
  add column if not exists uploaded_by uuid null references auth.users (id);

create index if not exists papers_uploaded_by_idx
  on public.papers using btree (uploaded_by);

-- 2) pending_papers: ensure status values are usable
alter table public.pending_papers
  add column if not exists reviewed_at timestamp with time zone null,
  add column if not exists reviewed_by uuid null references auth.users (id);

-- 3) Profiles: allow users to upsert themselves; allow public read of display_name
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "Users can upsert own profile" on public.profiles;
create policy "Users can upsert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4) pending_papers RLS
alter table public.pending_papers enable row level security;

drop policy if exists "Users insert own pending papers" on public.pending_papers;
create policy "Users insert own pending papers"
  on public.pending_papers for insert
  with check (auth.uid() = uploader_id);

drop policy if exists "Users read own pending papers" on public.pending_papers;
create policy "Users read own pending papers"
  on public.pending_papers for select
  using (
    auth.uid() = uploader_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );

drop policy if exists "Mods update pending papers" on public.pending_papers;
create policy "Mods update pending papers"
  on public.pending_papers for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );

-- 5) admin_audit: mods/admins can insert their own actions
alter table public.admin_audit enable row level security;

drop policy if exists "Admins insert audit" on public.admin_audit;
create policy "Admins insert audit"
  on public.admin_audit for insert
  with check (
    auth.uid() = admin_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );

drop policy if exists "Admins read audit" on public.admin_audit;
create policy "Admins read audit"
  on public.admin_audit for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );

-- 6) Allow authenticated insert into papers on approve (mods) + optional public read
-- Adjust if you already have tighter policies.
alter table public.papers enable row level security;

drop policy if exists "Papers are publicly readable" on public.papers;
create policy "Papers are publicly readable"
  on public.papers for select
  using (true);

drop policy if exists "Mods insert approved papers" on public.papers;
create policy "Mods insert approved papers"
  on public.papers for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );
