-- Job queue for async document generation
create table if not exists public.generator_jobs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  section_key text,
  status text not null default 'pending', -- pending, in_progress, completed, failed, cancelled
  progress integer not null default 0,
  attempt_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_text text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint generator_jobs_pkey primary key (id)
);

create index if not exists generator_jobs_user_idx on public.generator_jobs (user_id, status, created_at desc);

alter table public.generator_jobs enable row level security;

drop policy if exists "Users create own jobs" on public.generator_jobs;
create policy "Users create own jobs"
  on public.generator_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners read jobs" on public.generator_jobs;
create policy "Owners read jobs"
  on public.generator_jobs for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));
