create table public.pending_papers (
  id uuid not null default gen_random_uuid (),
  uploader_id uuid not null,
  school text not null,
  program text not null,
  type public.paper_type not null,
  title text not null,
  file_path text null,
  stored_file_id uuid null,
  file_url text null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  note text null,
  constraint pending_papers_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists pending_papers_uploader_idx on public.pending_papers using btree (uploader_id) TABLESPACE pg_default;