-- Conversation, call and private voice occupancy topics behind RLS.
--
-- Follows 20261103140000_private_voice_realtime.sql, which closed the voice media
-- and presence topics. This closes what it left open:
--   room:<conversation id>          members of that DM room or server channel
--   call:<profile id>               DM call signaling inbox: only its owner reads
--                                   it; a user who shares a DM room with the owner
--                                   and is not blocked either way may write to it
--   voice-roster:channel:<id>       who sits in a private voice channel; channel
--                                   members only. Clients no longer put private
--                                   channels on the server-wide voice-presence topic.
-- `global-signaling` is retired: the client now uses call:<profile id>.
--
-- Deploy this before the client that opens these topics as private channels, or
-- chat rooms and calls fail to join. Clients still on public channels are not
-- affected: Realtime keeps public and private topics apart.

create or replace function public.can_use_realtime_topic(topic text, for_write boolean)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null and case
    when topic ~ '^voice-(media|presence|roster):channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_channel_member(split_part(topic, ':', 3)::uuid)
    when topic ~ '^voice-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_server_member(split_part(topic, ':', 2)::uuid)
    when topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_dm_member(split_part(topic, ':', 2)::uuid)
        or public.is_channel_member(split_part(topic, ':', 2)::uuid)
    when topic ~ '^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then case
        when not for_write then split_part(topic, ':', 2)::uuid = auth.uid()
        else split_part(topic, ':', 2)::uuid <> auth.uid()
          and not public.users_blocked(auth.uid(), split_part(topic, ':', 2)::uuid)
          and exists (
            select 1
            from public.dm_members mine
            join public.dm_members theirs on theirs.dm_room_id = mine.dm_room_id
            where mine.profile_id = auth.uid()
              and theirs.profile_id = split_part(topic, ':', 2)::uuid
          )
      end
    else false
  end
$$;

revoke all on function public.can_use_realtime_topic(text, boolean) from public, anon;
grant execute on function public.can_use_realtime_topic(text, boolean) to authenticated;

drop policy if exists voice_topics_receive on realtime.messages;
drop policy if exists voice_topics_send on realtime.messages;
drop function if exists public.can_use_voice_topic(text);

drop policy if exists realtime_topics_receive on realtime.messages;
create policy realtime_topics_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select public.can_use_realtime_topic(realtime.topic(), false))
  );

drop policy if exists realtime_topics_send on realtime.messages;
create policy realtime_topics_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select public.can_use_realtime_topic(realtime.topic(), true))
  );
