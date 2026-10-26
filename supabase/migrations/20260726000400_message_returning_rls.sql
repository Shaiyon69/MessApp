-- PostgREST wraps insert(...).select(...) in a statement that immediately
-- reads the inserted row. The previous policy called can_access_message(id),
-- whose STABLE lookup could not see that row in the same statement snapshot.
-- Authorize reads directly from the row's conversation identifiers instead.

drop policy if exists "messages_read_participant" on public.messages;

create policy "messages_read_participant"
on public.messages
for select
to authenticated
using (
  (
    dm_room_id is not null
    and public.is_dm_member(dm_room_id)
  )
  or (
    channel_id is not null
    and public.is_channel_member(channel_id)
  )
);
