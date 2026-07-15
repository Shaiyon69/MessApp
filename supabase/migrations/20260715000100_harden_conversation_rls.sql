-- Remove permissive legacy policies that override membership-scoped policies.
-- PostgreSQL ORs permissive policies, so every broad policy must be removed.

-- Server/invite creation depends on this bounded pgcrypto wrapper, which was
-- referenced by the live functions but missing from the exported schema.
create or replace function extensions.messapp_random_bytes(byte_count integer)
returns bytea
language plpgsql
volatile
security invoker
set search_path = pg_catalog, extensions
as $$
begin
  if byte_count is null or byte_count not between 1 and 1024 then
    raise exception 'byte count must be between 1 and 1024';
  end if;
  return extensions.gen_random_bytes(byte_count);
end;
$$;

revoke all on function extensions.messapp_random_bytes(integer) from public, anon, authenticated;

drop policy if exists "Allow users to add dm members" on public.dm_members;
drop policy if exists "Allow users to see dm members" on public.dm_members;
drop policy if exists "Allow users to create dm rooms" on public.dm_rooms;
drop policy if exists "Allow users to see dm rooms" on public.dm_rooms;
drop policy if exists "Allow users to update dm_rooms" on public.dm_rooms;
drop policy if exists "Users can insert dm_rooms" on public.dm_rooms;
drop policy if exists "Users can delete their own DM rooms" on public.dm_rooms;
drop policy if exists "dm_rooms_create_authenticated" on public.dm_rooms;
drop policy if exists "dm_rooms_insert_auth" on public.dm_rooms;

drop policy if exists "Allow users to insert their own messages" on public.messages;
drop policy if exists "Allow users to view all messages" on public.messages;
drop policy if exists "Reactions are viewable by everyone" on public.message_reactions;
drop policy if exists "Users can insert their own reactions" on public.message_reactions;

drop policy if exists "Enable all for authenticated users" on public.invites;
drop policy if exists "Anyone can read active invites" on public.invites;
drop policy if exists "Anyone can use invite codes" on public.invites;
drop policy if exists "Secure invite updates" on public.invites;

drop policy if exists "Enable insert for authenticated users" on public.server_members;
drop policy if exists "Users can join servers" on public.server_members;
drop policy if exists "server_members_insert" on public.server_members;
drop policy if exists "server_members_insert_self_or_mod" on public.server_members;
drop policy if exists "Enable read access for all users" on public.server_members;

drop policy if exists "Enable read access for all users" on public.servers;
drop policy if exists "servers_all_access" on public.servers;
drop policy if exists "categories_all_access" on public.categories;

drop policy if exists "Users can insert/update their own reads" on public.channel_reads;
drop policy if exists "dm reads update own" on public.dm_reads;
drop policy if exists "dm reads upsert own" on public.dm_reads;

-- DM rooms and memberships are created atomically by create_or_get_dm().
-- Server joins are performed by join_server_by_code().
revoke insert on public.dm_rooms from anon, authenticated;
revoke insert on public.dm_members from anon, authenticated;
revoke insert on public.server_members from anon, authenticated;
revoke all on public.messages from anon;
revoke all on public.message_attachments from anon;
revoke all on public.message_reactions from anon;
revoke all on public.message_receipts from anon;
revoke all on public.dm_reads from anon;

-- Restore the category-based channel ownership model used by the schema.
create or replace function public.is_channel_member(
  target_channel_id uuid,
  target_profile_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (target_profile_id is null or target_profile_id = auth.uid())
    and exists (
      select 1
      from public.channels ch
      join public.categories cat on cat.id = ch.category_id
      join public.server_members sm on sm.server_id = cat.server_id
      where ch.id = target_channel_id
        and sm.profile_id = auth.uid()
    );
$$;

revoke all on function public.is_channel_member(uuid, uuid) from public, anon;
grant execute on function public.is_channel_member(uuid, uuid) to authenticated, service_role;

-- Only server moderators may add members directly. Normal users join through
-- join_server_by_code(), which validates and consumes the invite atomically.
create policy "server_members_insert_moderator"
on public.server_members
for insert
to authenticated
with check (public.is_server_moderator(server_id));

-- Resolve the conversation encoded by uploader/target/file object paths.
create or replace function public.can_access_chat_attachment(
  object_name text,
  user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null or user_id is distinct from auth.uid() then
    return false;
  end if;

  target_id := nullif(split_part(object_name, '/', 2), '')::uuid;
  return public.is_dm_member(target_id, user_id)
    or public.is_channel_member(target_id, user_id);
exception
  when invalid_text_representation then return false;
end;
$$;

revoke all on function public.can_access_chat_attachment(text, uuid) from public, anon;
grant execute on function public.can_access_chat_attachment(text, uuid) to authenticated, service_role;

-- Public buckets bypass download authorization, so chat media must be private.
update storage.buckets
set public = false
where id = 'chat-attachments';

drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow public viewing" on storage.objects;
drop policy if exists "authenticated_uploads" on storage.objects;
drop policy if exists "public_viewing" on storage.objects;
drop policy if exists "chat_attachments_delete_owner_path" on storage.objects;
drop policy if exists "chat_attachments_insert_owner_path" on storage.objects;
drop policy if exists "chat_attachments_owner_delete" on storage.objects;
drop policy if exists "chat_attachments_owner_insert" on storage.objects;
drop policy if exists "chat_attachments_select_authenticated" on storage.objects;
drop policy if exists "chat_attachments_update_owner_path" on storage.objects;

create policy "chat_attachments_select_participant"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and public.can_access_chat_attachment(name)
);

create policy "chat_attachments_insert_participant_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_chat_attachment(name)
);

create policy "chat_attachments_update_participant_owner"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_chat_attachment(name)
)
with check (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_chat_attachment(name)
);

create policy "chat_attachments_delete_participant_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.can_access_chat_attachment(name)
);
