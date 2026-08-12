-- Library saves + likes (app syncs signed-in users here; guests stay on localStorage).
-- Safe to re-run (idempotent).

create table if not exists public.saves (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references public.papers (id) on delete cascade,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint saves_pkey primary key (id),
  constraint saves_user_paper_unique unique (user_id, paper_id)
);

create table if not exists public.likes (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references public.papers (id) on delete cascade,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint likes_pkey primary key (id),
  constraint likes_user_paper_unique unique (user_id, paper_id)
);

alter table public.saves enable row level security;
alter table public.likes enable row level security;

drop policy if exists "Users manage own saves" on public.saves;
create policy "Users manage own saves"
  on public.saves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own likes" on public.likes;
create policy "Users manage own likes"
  on public.likes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
