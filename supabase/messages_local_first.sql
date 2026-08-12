-- Local-first messaging (lean cloud envelopes)
-- Safe to re-run.
--
-- Strategy:
--   • Device IndexedDB holds full DM history
--   • Postgres keeps thread envelopes: ids, peers, preview, read flags
--   • DM bodies are cleared from Postgres after the recipient claims them
--   • Support / staff messages KEEP body in DB for admin tooling
--
-- App code: datacampus/src/utils/localMessageStore.ts + useMessages.tsx

-- Ensure metadata jsonb exists for preview / claim flags
alter table public.messages
  add column if not exists metadata jsonb null default '{}'::jsonb;

-- Optional claim timestamp (nullable; also mirrored in metadata.body_cleared)
alter table public.messages
  add column if not exists body_cleared_at timestamp with time zone null;

create index if not exists messages_body_pending_idx
  on public.messages (recipient_id, created_at desc)
  where body is not null;

comment on column public.messages.body is
  'Temporary DM payload for delivery. Cleared after recipient device claims into IndexedDB. Support/staff may retain body.';

comment on column public.messages.metadata is
  'Includes preview (always), body_cleared, local_first flags. Not a full transcript store.';
