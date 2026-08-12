create table public.stored_files (
  id uuid not null default gen_random_uuid (),
  file_path text not null,
  file_hash text null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint stored_files_pkey primary key (id),
  constraint stored_files_file_hash_unique unique (file_hash)
) TABLESPACE pg_default;