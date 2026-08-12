-- Ephemeral DM media bucket (local-first messaging)
-- Safe to re-run.
-- Objects live briefly under {minUid}/{maxUid}/{messageId}.ext then are deleted after claim.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Participants may read/write/delete objects in their shared conversation folder.
drop policy if exists "Chat media participants read" on storage.objects;
create policy "Chat media participants read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
      or public.is_staff(auth.uid())
    )
  );

drop policy if exists "Chat media participants upload" on storage.objects;
create policy "Chat media participants upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "Chat media participants update" on storage.objects;
create policy "Chat media participants update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
      or public.is_staff(auth.uid())
    )
  )
  with check (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
      or public.is_staff(auth.uid())
    )
  );

drop policy if exists "Chat media participants delete" on storage.objects;
create policy "Chat media participants delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or auth.uid()::text = (storage.foldername(name))[2]
      or public.is_staff(auth.uid())
    )
  );
