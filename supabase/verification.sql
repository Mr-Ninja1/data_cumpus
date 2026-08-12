-- Wave E — student ID verification (OCR)
-- Safe to re-run. Requires: profiles, wave_c (is_staff).

alter table public.profiles
  add column if not exists full_name text;

alter table public.profiles
  add column if not exists student_id text;

alter table public.profiles
  add column if not exists program text;

alter table public.profiles
  add column if not exists department text;

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

alter table public.profiles
  add column if not exists verification_status text not null default 'unverified';

alter table public.profiles
  add column if not exists verified_at timestamp with time zone;

alter table public.profiles
  add column if not exists verification_confidence numeric;

alter table public.profiles
  add column if not exists verification_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_status_check
      check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'needs_review'));
  end if;
end $$;

create unique index if not exists profiles_student_id_unique
  on public.profiles (student_id)
  where student_id is not null;

create table if not exists public.verification_submissions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  image_path text not null,
  ocr_payload jsonb not null default '{}'::jsonb,
  full_name text,
  student_id text,
  program text,
  department text,
  confidence numeric,
  status text not null default 'pending',
  reviewed_by uuid,
  review_notes text,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint verification_submissions_pkey primary key (id),
  constraint verification_submissions_status_check
    check (status in ('pending', 'approved', 'rejected', 'needs_review'))
);

create index if not exists verification_submissions_user_idx
  on public.verification_submissions (user_id, created_at desc);

create index if not exists verification_submissions_status_idx
  on public.verification_submissions (status, created_at desc);

alter table public.verification_submissions enable row level security;

drop policy if exists "Users read own verification submissions" on public.verification_submissions;
create policy "Users read own verification submissions"
  on public.verification_submissions for select
  using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists "Users insert own verification submissions" on public.verification_submissions;
create policy "Users insert own verification submissions"
  on public.verification_submissions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Staff update verification submissions" on public.verification_submissions;
create policy "Staff update verification submissions"
  on public.verification_submissions for update
  using (public.is_staff(auth.uid()));

-- Storage bucket for ID images (create in Supabase dashboard if needed: verification-ids, private)
-- RLS on storage.objects should allow authenticated users to upload to their folder.
