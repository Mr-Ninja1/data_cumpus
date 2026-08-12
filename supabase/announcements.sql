-- Site-wide announcements / banners / promos (staff → everyone).
-- Safe to re-run. Requires wave_c_social_foundation.sql (is_staff).

create table if not exists public.announcements (
  id uuid not null default gen_random_uuid (),
  kind text not null default 'banner',
  title text not null,
  body text null,
  link text null,
  link_label text null,
  audience text not null default 'all',
  is_active boolean not null default true,
  starts_at timestamp with time zone not null default timezone ('utc'::text, now()),
  ends_at timestamp with time zone null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint announcements_pkey primary key (id),
  constraint announcements_kind_check check (kind in ('banner', 'alert', 'promo')),
  constraint announcements_audience_check check (audience in ('all', 'signed_in', 'staff'))
);

create index if not exists announcements_active_idx
  on public.announcements using btree (is_active, starts_at desc);

alter table public.announcements enable row level security;

drop policy if exists "Public read active announcements" on public.announcements;
create policy "Public read active announcements"
  on public.announcements for select
  using (
    is_active = true
    and starts_at <= timezone ('utc'::text, now())
    and (ends_at is null or ends_at > timezone ('utc'::text, now()))
    and (
      audience = 'all'
      or (audience = 'signed_in' and auth.uid() is not null)
      or (audience = 'staff' and public.is_staff(auth.uid()))
    )
  );

drop policy if exists "Staff read all announcements" on public.announcements;
create policy "Staff read all announcements"
  on public.announcements for select
  using (public.is_staff(auth.uid()));

drop policy if exists "Staff insert announcements" on public.announcements;
create policy "Staff insert announcements"
  on public.announcements for insert
  with check (public.is_staff(auth.uid()));

drop policy if exists "Staff update announcements" on public.announcements;
create policy "Staff update announcements"
  on public.announcements for update
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "Staff delete announcements" on public.announcements;
create policy "Staff delete announcements"
  on public.announcements for delete
  using (public.is_staff(auth.uid()));
