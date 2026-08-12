create table public.messages (
  id uuid not null default gen_random_uuid (),
  recipient_id uuid not null,
  sender_id uuid null,
  subject text null,
  body text null,
  read boolean null default false,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default timezone ('utc'::text, now()),
  constraint messages_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists messages_recipient_idx on public.messages using btree (recipient_id) TABLESPACE pg_default;