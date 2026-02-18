-- Run this in the Supabase SQL editor to create the papers table
create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  school text not null,
  program text not null,
  type text not null,
  title text not null,
  file_url text not null,
  uploaded_at timestamp with time zone default timezone('utc'::text, now())
);

-- Add file_path to store the storage object key (used for server-side signed URLs)
alter table public.papers
  add column if not exists file_path text;

-- Optional: backfill file_path from existing public URLs (adjust regex if your URLs differ)
-- update public.papers
-- set file_path = regexp_replace(regexp_replace(file_url, '^.*?/papers/', ''), '\\?.*$', '')
-- where file_path is null and file_url is not null;
