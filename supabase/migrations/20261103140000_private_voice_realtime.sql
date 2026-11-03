-- Voice realtime topics behind RLS.
--
-- Voice used public Realtime channels, so anyone signed in who knew a channel
-- id could join its media mesh (voice-media:channel:<id>) or presence, private
-- channel or not. The client now opens these three topics as private channels,
-- and Realtime checks them against realtime.messages policies:
--   voice-media:channel:<channel id>     channel members (is_channel_member)
--   voice-presence:channel:<channel id>  channel members
--   voice-presence:<server id>           server members
-- Every other topic stays a public channel; these policies never see them.
--
-- Deploy this before the client that sets private: true, or voice joins fail.

create or replace function public.can_use_voice_topic(topic text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when topic ~ '^voice-(media|presence):channel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_channel_member(split_part(topic, ':', 3)::uuid)
    when topic ~ '^voice-presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_server_member(split_part(topic, ':', 2)::uuid)
    else false
  end
$$;

revoke all on function public.can_use_voice_topic(text) from public, anon;
grant execute on function public.can_use_voice_topic(text) to authenticated;

drop policy if exists voice_topics_receive on realtime.messages;
create policy voice_topics_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select public.can_use_voice_topic(realtime.topic()))
  );

drop policy if exists voice_topics_send on realtime.messages;
create policy voice_topics_send on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and (select public.can_use_voice_topic(realtime.topic()))
  );
