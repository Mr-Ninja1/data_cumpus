create table if not exists public.workspace_school_settings (
  id text primary key default 'default',
  school_name text not null default 'Zambia University College of Technology',
  school_short_name text not null default 'ZUT',
  default_program text,
  default_proposal_spec_key text,
  logo_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

alter table public.workspace_school_settings enable row level security;

drop policy if exists "Staff manage workspace school settings" on public.workspace_school_settings;
create policy "Staff manage workspace school settings"
  on public.workspace_school_settings for all
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));
