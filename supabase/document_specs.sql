-- Specs for document types / SKILLs (used to guide model generation)
create table if not exists public.document_specs (
  id uuid not null default gen_random_uuid(),
  key text not null,
  title text not null,
  description text,
  spec_md text not null default '',
  examples jsonb not null default '[]'::jsonb,
  user_id uuid not null,
  is_public boolean not null default false,
  approved boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint document_specs_pkey primary key (id),
  constraint document_specs_key_unique unique (key)
);

create index if not exists document_specs_user_idx on public.document_specs (user_id, updated_at desc);

alter table public.document_specs enable row level security;

drop policy if exists "Owners manage specs" on public.document_specs;
create policy "Owners manage specs"
  on public.document_specs for all
  using (auth.uid() = user_id or public.is_staff(auth.uid()))
  with check (auth.uid() = user_id);

-- Admins and owners can read
drop policy if exists "Owners read specs" on public.document_specs;
create policy "Owners read specs"
  on public.document_specs for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- Note: create a `specs` folder in storage or manage spec content via DB via admin UI.
