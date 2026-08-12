create table public.profiles (
  id uuid not null,
  display_name text null,
  role public.role_enum not null default 'user'::role_enum,
  permissions jsonb not null default '{}'::jsonb,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint profiles_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists profiles_role_idx on public.profiles using btree (role) TABLESPACE pg_default;