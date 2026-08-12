-- Wave G — proposal AI workspace
-- Safe to re-run. Requires: profiles.

create table if not exists public.proposal_projects (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled Proposal',
  department text,
  supervisor text,
  academic_year text,
  status text not null default 'draft',
  current_step text not null default 'cover',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_projects_pkey primary key (id),
  constraint proposal_projects_status_check
    check (status in ('draft', 'in_progress', 'complete', 'archived'))
);

create index if not exists proposal_projects_user_idx
  on public.proposal_projects (user_id, updated_at desc);

create table if not exists public.proposal_sections (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.proposal_projects (id) on delete cascade,
  section_key text not null,
  title text not null,
  content_md text not null default '',
  version integer not null default 1,
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_sections_pkey primary key (id),
  constraint proposal_sections_project_key_unique unique (project_id, section_key)
);

create index if not exists proposal_sections_project_idx
  on public.proposal_sections (project_id);

create table if not exists public.proposal_generations (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.proposal_projects (id) on delete cascade,
  section_id uuid references public.proposal_sections (id) on delete set null,
  prompt_type text not null,
  prompt_text text,
  response_text text,
  credits_spent integer not null default 0,
  model text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_generations_pkey primary key (id)
);

create index if not exists proposal_generations_project_idx
  on public.proposal_generations (project_id, created_at desc);

create table if not exists public.proposal_exports (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.proposal_projects (id) on delete cascade,
  format text not null default 'pdf',
  file_path text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_exports_pkey primary key (id),
  constraint proposal_exports_format_check check (format in ('pdf', 'docx', 'html')),
  constraint proposal_exports_status_check
    check (status in ('pending', 'processing', 'complete', 'failed'))
);

alter table public.proposal_projects enable row level security;
alter table public.proposal_sections enable row level security;
alter table public.proposal_generations enable row level security;
alter table public.proposal_exports enable row level security;

drop policy if exists "Owners manage own proposals" on public.proposal_projects;
create policy "Owners manage own proposals"
  on public.proposal_projects for all
  using (auth.uid() = user_id or public.is_staff(auth.uid()))
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage own proposal sections" on public.proposal_sections;
create policy "Owners manage own proposal sections"
  on public.proposal_sections for all
  using (
    exists (
      select 1 from public.proposal_projects p
      where p.id = project_id and (p.user_id = auth.uid() or public.is_staff(auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.proposal_projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Owners read own generations" on public.proposal_generations;
create policy "Owners read own generations"
  on public.proposal_generations for select
  using (
    exists (
      select 1 from public.proposal_projects p
      where p.id = project_id and (p.user_id = auth.uid() or public.is_staff(auth.uid()))
    )
  );

drop policy if exists "Owners read own exports" on public.proposal_exports;
create policy "Owners read own exports"
  on public.proposal_exports for select
  using (
    exists (
      select 1 from public.proposal_projects p
      where p.id = project_id and (p.user_id = auth.uid() or public.is_staff(auth.uid()))
    )
  );
