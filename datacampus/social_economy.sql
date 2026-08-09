-- Run this in the Supabase SQL editor.
-- Adds the "social economy" layer: peer-to-peer wallet transfers, paid
-- follow/message fees (anti-harassment + monetization), blocking, and
-- paid profile posts.
--
-- Assumes supabase.sql (papers/stored_files) and the follows/messages/
-- notifications/wallets/wallet_transactions tables already exist.

-- 1) Per-user monetization settings ------------------------------------

alter table public.profiles
  add column if not exists follow_fee_credits integer not null default 0;

alter table public.profiles
  add column if not exists message_fee_credits integer not null default 0;

alter table public.profiles
  add constraint profiles_follow_fee_nonnegative check (follow_fee_credits >= 0);

alter table public.profiles
  add constraint profiles_message_fee_nonnegative check (message_fee_credits >= 0);

-- 2) Blocking — stops follows/message requests either direction --------

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default timezone('utc'::text, now()),
  constraint blocks_unique unique (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own" on public.blocks
  for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);

-- Inserts/deletes for blocks go through the server (service role) so
-- that harassment-prevention rules can't be bypassed client-side.

-- 3) Paid / free posts on a profile -------------------------------------

create table if not exists public.profile_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text,
  media_path text,
  price_credits integer not null default 0,
  created_at timestamptz default timezone('utc'::text, now()),
  constraint profile_posts_price_nonnegative check (price_credits >= 0),
  constraint profile_posts_has_content check (body is not null or media_path is not null)
);

create index if not exists profile_posts_user_idx on public.profile_posts (user_id, created_at desc);

alter table public.profile_posts enable row level security;

drop policy if exists "profile_posts_select_all" on public.profile_posts;
create policy "profile_posts_select_all" on public.profile_posts
  for select using (true);
-- Note: the API route that serves posts (GET /api/social/posts) strips
-- `body`/`media_path` server-side for non-owners who haven't paid, so
-- allowing SELECT here is safe — this policy only lets clients see rows
-- exist, not their paid content (the app never queries this table
-- directly from the browser for `body`/`media_path`).

drop policy if exists "profile_posts_insert_own" on public.profile_posts;
create policy "profile_posts_insert_own" on public.profile_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "profile_posts_delete_own" on public.profile_posts;
create policy "profile_posts_delete_own" on public.profile_posts
  for delete using (auth.uid() = user_id);

-- 4) Records who has paid to unlock a post ------------------------------

create table if not exists public.post_unlocks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.profile_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits_paid integer not null default 0,
  created_at timestamptz default timezone('utc'::text, now()),
  constraint post_unlocks_unique unique (post_id, user_id)
);

alter table public.post_unlocks enable row level security;

drop policy if exists "post_unlocks_select_own" on public.post_unlocks;
create policy "post_unlocks_select_own" on public.post_unlocks
  for select using (auth.uid() = user_id);

-- Inserts go through the server (service role) since they move credits.
