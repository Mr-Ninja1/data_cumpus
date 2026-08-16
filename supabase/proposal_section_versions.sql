-- Proposal Section Versions Table
-- Tracks all edits to proposal sections for undo/diff functionality
-- Safe to re-run: uses "CREATE TABLE IF NOT EXISTS"

create table if not exists public.proposal_section_versions (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null references public.proposal_projects (id) on delete cascade,
  section_key text not null,
  version_number integer not null,
  content_md text not null,
  changed_by text not null default 'ai_generation',
  change_reason text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_section_versions_pkey primary key (id),
  constraint proposal_section_versions_project_section_version_unique 
    unique (project_id, section_key, version_number),
  constraint proposal_section_versions_changed_by_check 
    check (changed_by in ('user_request', 'ai_generation', 'system'))
);

-- Index for fast lookup of version history per section
create index if not exists proposal_section_versions_project_section_idx
  on public.proposal_section_versions (project_id, section_key, version_number desc);

-- Index for audit trail per project
create index if not exists proposal_section_versions_project_idx
  on public.proposal_section_versions (project_id, created_at desc);

-- Enable RLS
alter table public.proposal_section_versions enable row level security;

-- RLS Policy: Users can only see their own project's versions
drop policy if exists "Owners view own section versions" on public.proposal_section_versions;
create policy "Owners view own section versions"
  on public.proposal_section_versions for select
  using (
    exists (
      select 1 from public.proposal_projects p
      where p.id = project_id and (p.user_id = auth.uid() or public.is_staff(auth.uid()))
    )
  );

-- Modification: Add current_version_number to proposal_sections
-- (Run this if the column doesn't exist)
alter table public.proposal_sections 
  add column if not exists current_version_number integer default 1;

-- Create a helper function to get the latest version of a section
create or replace function public.get_latest_section_version(
  p_project_id uuid,
  p_section_key text
)
returns table (
  version_number integer,
  content_md text,
  changed_by text,
  change_reason text,
  created_at timestamp with time zone
) as $$
  select 
    psv.version_number,
    psv.content_md,
    psv.changed_by,
    psv.change_reason,
    psv.created_at
  from public.proposal_section_versions psv
  where psv.project_id = p_project_id 
    and psv.section_key = p_section_key
  order by psv.version_number desc
  limit 1;
$$ language sql stable;

-- Create a helper function to get version history for a section
create or replace function public.get_section_version_history(
  p_project_id uuid,
  p_section_key text
)
returns table (
  version_number integer,
  content_md text,
  changed_by text,
  change_reason text,
  created_at timestamp with time zone
) as $$
  select 
    psv.version_number,
    psv.content_md,
    psv.changed_by,
    psv.change_reason,
    psv.created_at
  from public.proposal_section_versions psv
  where psv.project_id = p_project_id 
    and psv.section_key = p_section_key
  order by psv.version_number desc;
$$ language sql stable;

-- Trigger to auto-create version entries when proposal_sections are updated
-- (Optional - can be added later if automatic versioning is desired)
-- Note: For now, versioning is explicit from the edit tools

commit;
