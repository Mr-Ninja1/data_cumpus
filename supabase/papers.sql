create table public.papers (
  id uuid not null default gen_random_uuid (),
  school text not null,
  program text not null,
  type public.paper_type not null,
  title text not null,
  file_url text not null,
  uploaded_at timestamp with time zone null default timezone ('utc'::text, now()),
  file_path text null,
  stored_file_id uuid null,
  constraint papers_pkey primary key (id),
  constraint papers_stored_file_fk foreign KEY (stored_file_id) references stored_files (id)
) TABLESPACE pg_default;