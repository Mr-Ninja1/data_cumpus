-- DM actions: ephemeral sync signals (local-first messaging)
-- Safe to re-run.
-- Requires: messages_foundation.sql
--
-- Postgres is NOT a message store. It only carries brief delivery envelopes:
--   • New message body (cleared after recipient claims into IndexedDB)
--   • Delete-for-everyone signal (row purged after both sides sync)
--   • Read receipts
-- Full chat history lives in device IndexedDB (localMessageStore.ts).

-- Allow participants to update envelopes (read receipts, ephemeral delete signals)
drop policy if exists "Recipients mark read" on public.messages;
drop policy if exists "Senders update own messages" on public.messages;
drop policy if exists "Participants update message envelopes" on public.messages;
create policy "Participants update message envelopes"
  on public.messages for update
  using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or public.is_staff(auth.uid())
  )
  with check (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or public.is_staff(auth.uid())
  );

-- Allow senders to purge their own ephemeral envelopes after sync
drop policy if exists "Senders delete own messages" on public.messages;
drop policy if exists "Participants delete ephemeral envelopes" on public.messages;
create policy "Participants delete ephemeral envelopes"
  on public.messages for delete
  using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or public.is_staff(auth.uid())
  );

comment on column public.messages.metadata is
  'Ephemeral envelope only: preview, body_cleared, deleted_for_everyone, reply_to (stripped after claim). Not a transcript.';
