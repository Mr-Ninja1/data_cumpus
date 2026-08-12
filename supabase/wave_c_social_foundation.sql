-- Wave C — STEP 2 of 2: social foundation + richer roles
--
-- PREREQUISITE: run wave_c_social_foundation_01_enums.sql FIRST (alone).
--
-- Run after:
--   1) supabase/saves.sql
--   2) supabase/wave_b_migration.sql
--   3) supabase/wave_c_social_foundation_01_enums.sql  (committed)
--   4) THIS FILE
--
-- Promote users after migration:
--   update public.profiles set role = 'admin' where id = '<uuid>';
--   update public.profiles set role = 'moderator' where id = '<uuid>';
--   update public.profiles set role = 'trusted_contributor' where id = '<uuid>';

-- Staff check helper (text cast avoids enum-in-same-transaction edge cases)
create or replace function public.is_staff(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role::text in ('moderator', 'admin', 'owner')
  );
$$;

revoke all on function public.is_staff(uuid) from public;
grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to anon;

-- 1) Follows: user follows uploader/user
create table if not exists public.follows (
  id uuid not null default gen_random_uuid (),
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint follows_pkey primary key (id),
  constraint follows_unique unique (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_follower_idx
  on public.follows using btree (follower_id);

create index if not exists follows_following_idx
  on public.follows using btree (following_id);

alter table public.follows enable row level security;

drop policy if exists "Users read follows" on public.follows;
create policy "Users read follows"
  on public.follows for select
  using (true);

drop policy if exists "Users manage own follows" on public.follows;
create policy "Users manage own follows"
  on public.follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- 2) Comments
create table if not exists public.comments (
  id uuid not null default gen_random_uuid (),
  paper_id uuid not null references public.papers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  parent_id uuid null references public.comments (id) on delete cascade,
  is_hidden boolean not null default false,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint comments_pkey primary key (id),
  constraint comments_body_len check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists comments_paper_idx
  on public.comments using btree (paper_id, created_at desc);

create index if not exists comments_user_idx
  on public.comments using btree (user_id);

create index if not exists comments_parent_idx
  on public.comments using btree (parent_id);

alter table public.comments enable row level security;

drop policy if exists "Public read visible comments" on public.comments;
create policy "Public read visible comments"
  on public.comments for select
  using (
    is_hidden = false
    or auth.uid() = user_id
    or public.is_staff(auth.uid())
  );

drop policy if exists "Users insert own comments" on public.comments;
create policy "Users insert own comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own comments" on public.comments;
create policy "Users update own comments"
  on public.comments for update
  using (auth.uid() = user_id or public.is_staff(auth.uid()))
  with check (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Users delete own comments" on public.comments;
create policy "Users delete own comments"
  on public.comments for delete
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- 3) Reports: papers or comments
create table if not exists public.reports (
  id uuid not null default gen_random_uuid (),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid null references public.papers (id) on delete cascade,
  comment_id uuid null references public.comments (id) on delete cascade,
  reason text not null,
  details text null,
  status text not null default 'open',
  assigned_to uuid null references auth.users (id) on delete set null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  reviewed_at timestamp with time zone null,
  reviewed_by uuid null references auth.users (id) on delete set null,
  constraint reports_pkey primary key (id),
  constraint reports_target_check check (
    (paper_id is not null and comment_id is null)
    or (paper_id is null and comment_id is not null)
  )
);

create index if not exists reports_status_idx
  on public.reports using btree (status, created_at);

create index if not exists reports_reporter_idx
  on public.reports using btree (reporter_id);

alter table public.reports enable row level security;

drop policy if exists "Users insert own reports" on public.reports;
create policy "Users insert own reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

drop policy if exists "Users read own reports or staff read all" on public.reports;
create policy "Users read own reports or staff read all"
  on public.reports for select
  using (auth.uid() = reporter_id or public.is_staff(auth.uid()));

drop policy if exists "Staff update reports" on public.reports;
create policy "Staff update reports"
  on public.reports for update
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 4) Notifications / inbox foundation
create table if not exists public.notifications (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text null,
  link text null,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint notifications_pkey primary key (id)
);

create index if not exists notifications_user_idx
  on public.notifications using btree (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Staff insert notifications" on public.notifications;
create policy "Staff insert notifications"
  on public.notifications for insert
  with check (public.is_staff(auth.uid()));

-- 5) Convenience view for public channel stats
create or replace view public.channel_stats as
select
  p.uploaded_by as user_id,
  count(*)::bigint as upload_count
from public.papers p
where p.uploaded_by is not null
group by p.uploaded_by;
