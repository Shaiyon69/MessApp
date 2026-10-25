-- MessApp Storage baseline.
-- Keep this limited to app buckets and app policies; do not copy Supabase-managed
-- storage schema, triggers, or internal functions into migrations.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']::text[]
  ),
  (
    'chat-attachments',
    'chat-attachments',
    false,
    52428800,
    null
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The hosted project may already contain policies created manually before
-- migration history was established. Recreate only these same named policies
-- so the baseline is safe to apply to both fresh and drifted databases.
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow public viewing" on storage.objects;
drop policy if exists "Avatars are publicly accessible" on storage.objects;
drop policy if exists "Users can update their own avatars" on storage.objects;
drop policy if exists "Users can upload their own avatars" on storage.objects;
drop policy if exists "authenticated_uploads" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;
drop policy if exists "chat_attachments_delete_owner_path" on storage.objects;
drop policy if exists "chat_attachments_insert_owner_path" on storage.objects;
drop policy if exists "chat_attachments_owner_delete" on storage.objects;
drop policy if exists "chat_attachments_owner_insert" on storage.objects;
drop policy if exists "chat_attachments_select_authenticated" on storage.objects;
drop policy if exists "chat_attachments_update_owner_path" on storage.objects;
drop policy if exists "public_viewing" on storage.objects;

create policy "Allow authenticated uploads"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-attachments');

create policy "Allow public viewing"
on storage.objects
for select
using (bucket_id = 'chat-attachments');

create policy "Avatars are publicly accessible"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Users can update their own avatars"
on storage.objects
for update
using (bucket_id = 'avatars' and auth.uid() = owner);

create policy "Users can upload their own avatars"
on storage.objects
for insert
with check (bucket_id = 'avatars' and auth.uid() = owner);

create policy "authenticated_uploads"
on storage.objects
for insert
with check (
  bucket_id = 'chat-attachments'
  and auth.role() = 'authenticated'
);

create policy "avatars_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and name like auth.uid()::text || '-avatar-%'
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif'
  )
);

create policy "avatars_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
);

create policy "avatars_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and owner_id = auth.uid()::text
);

create policy "chat_attachments_delete_owner_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "chat_attachments_insert_owner_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "chat_attachments_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and owner_id = auth.uid()::text
);

create policy "chat_attachments_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "chat_attachments_select_authenticated"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-attachments');

create policy "chat_attachments_update_owner_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "public_viewing"
on storage.objects
for select
using (bucket_id = 'chat-attachments');
