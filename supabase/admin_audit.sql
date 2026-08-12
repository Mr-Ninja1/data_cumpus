create table public.admin_audit (
  id uuid not null default gen_random_uuid (),
  admin_id uuid not null,
  target_user_id uuid null,
  action text not null,
  details jsonb null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint admin_audit_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists admin_audit_admin_idx on public.admin_audit using btree (admin_id) TABLESPACE pg_default;