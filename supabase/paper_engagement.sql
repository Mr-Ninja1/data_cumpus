-- Paper engagement counters (views + likes) for social feed cards.
-- Run in Supabase SQL editor after wave_b / saves migrations.

alter table public.papers
  add column if not exists view_count bigint not null default 0;

alter table public.papers
  add column if not exists like_count bigint not null default 0;

create index if not exists papers_view_count_idx on public.papers (view_count desc);
create index if not exists papers_like_count_idx on public.papers (like_count desc);

-- Backfill like_count from likes table when present
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'likes'
  ) then
    update public.papers p
    set like_count = coalesce(c.cnt, 0)
    from (
      select paper_id, count(*)::bigint as cnt
      from public.likes
      group by paper_id
    ) c
    where p.id = c.paper_id;
  end if;
end $$;

-- Atomic view bump (callable by anon / authenticated)
create or replace function public.increment_paper_views(p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.papers
  set view_count = coalesce(view_count, 0) + 1
  where id = p_id
  returning view_count into new_count;
  return coalesce(new_count, 0);
end;
$$;

revoke all on function public.increment_paper_views(uuid) from public;
grant execute on function public.increment_paper_views(uuid) to anon, authenticated, service_role;

-- Atomic like_count adjust (+1 / -1)
create or replace function public.adjust_paper_likes(p_id uuid, delta integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.papers
  set like_count = greatest(0, coalesce(like_count, 0) + delta)
  where id = p_id
  returning like_count into new_count;
  return coalesce(new_count, 0);
end;
$$;

revoke all on function public.adjust_paper_likes(uuid, integer) from public;
grant execute on function public.adjust_paper_likes(uuid, integer) to authenticated, service_role;
