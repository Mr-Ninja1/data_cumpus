-- Wave G+ — proposal templates and indexing for RAG
-- Idempotent. Requires: proposal_projects, profiles

create table if not exists public.proposal_templates (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Untitled Template',
  description text,
  file_path text,
  metadata jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  approved boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_templates_pkey primary key (id)
);

create index if not exists proposal_templates_user_idx
  on public.proposal_templates (user_id, updated_at desc);

create table if not exists public.proposal_template_chunks (
  id uuid not null default gen_random_uuid(),
  template_id uuid not null references public.proposal_templates (id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  embedding jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint proposal_template_chunks_pkey primary key (id)
);

create index if not exists proposal_template_chunks_template_idx
  on public.proposal_template_chunks (template_id, chunk_index);

alter table public.proposal_templates enable row level security;
alter table public.proposal_template_chunks enable row level security;

drop policy if exists "Admins manage templates" on public.proposal_templates;
create policy "Admins manage templates"
  on public.proposal_templates for all
  using (auth.uid() = user_id or public.is_staff(auth.uid()))
  with check (auth.uid() = user_id);

drop policy if exists "Owners read template chunks" on public.proposal_template_chunks;
create policy "Owners read template chunks"
  on public.proposal_template_chunks for select
  using (
    exists (
      select 1 from public.proposal_templates t
      where t.id = template_id and (t.user_id = auth.uid() or public.is_staff(auth.uid()))
    )
  );

-- Note: create a storage bucket `proposal_templates` in Supabase dashboard (private)
