-- Run this in the Supabase SQL editor to create the papers table
-- Create an enum type for paper types (safe: only creates if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paper_type') THEN
    CREATE TYPE paper_type AS ENUM ('Exam', 'Test', 'Material');
  END IF;
END$$;

-- Create the papers table if it does not exist, using the `paper_type` enum for the `type` column
create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  school text not null,
  program text not null,
  type paper_type not null,
  title text not null,
  file_url text not null,
  uploaded_at timestamp with time zone default timezone('utc'::text, now())
);

-- Add `file_path` to store the storage object key (used for server-side proxy delivery)
alter table public.papers
  add column if not exists file_path text;

-- Add `file_hash` to enable content deduplication (SHA-256 hex)
alter table public.papers
  add column if not exists file_hash text;

-- Create a partial unique index on `file_hash` to prevent storing the same blob multiple times
create unique index if not exists papers_file_hash_idx on public.papers (file_hash) where file_hash is not null;

-- Migration: if an existing table used `text` for `type`, coerce/clean values into the enum and alter the column.
-- This maps any unknown or legacy values (e.g. 'Other') to 'Material' before changing the type.
DO $$
BEGIN
  -- Only run if table exists and `type` is not already the enum
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'papers')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'papers' AND column_name = 'type')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paper_type' AND
                    (SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='papers' AND column_name='type') = 'paper_type') THEN

    -- Normalize unknown values to 'Material' to avoid cast failures
    UPDATE public.papers
    SET type = 'Material'
    WHERE type IS NULL OR type NOT IN ('Exam', 'Test', 'Material');

    -- Now safely alter the column to use the enum type
    ALTER TABLE public.papers ALTER COLUMN type TYPE paper_type USING type::paper_type;
  END IF;
END$$;

-- Optional: backfill file_path from existing public URLs (adjust regex if your URLs differ)
-- update public.papers
-- set file_path = regexp_replace(regexp_replace(file_url, '^.*?/papers/', ''), '\\?.*$', '')
-- where file_path is null and file_url is not null;

-- Create a normalized table to track stored blobs and support many-to-one metadata rows
create table if not exists public.stored_files (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  file_hash text,
  created_at timestamptz default timezone('utc'::text, now()),
  constraint stored_files_file_hash_unique unique (file_hash)
);

-- Backfill stored_files from existing papers (keep first observed file_path per hash)
insert into public.stored_files (file_path, file_hash, created_at)
select file_path, file_hash, timezone('utc'::text, now())
from (
  select distinct on (file_hash) file_path, file_hash
  from public.papers
  where file_hash is not null and file_path is not null
) s
where s.file_hash is not null;

-- Add `stored_file_id` to papers and link existing rows to stored_files
alter table public.papers add column if not exists stored_file_id uuid;

update public.papers p
set stored_file_id = sf.id
from public.stored_files sf
where p.file_hash = sf.file_hash;

-- Add foreign key to ensure referential integrity
alter table public.papers
  add constraint papers_stored_file_fk foreign key (stored_file_id) references public.stored_files(id);

-- Remove the previous unique index on papers.file_hash (we now dedupe via stored_files)
drop index if exists papers_file_hash_idx;

-- Optional: drop file_hash from papers now that stored_files holds canonical hash
alter table public.papers
  drop column if exists file_hash;
