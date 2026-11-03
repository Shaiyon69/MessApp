-- Database changes reach clients as Broadcast, not postgres_changes.
--
-- postgres_changes made Realtime poll the WAL nonstop (realtime.list_changes,
-- 1.6M calls and 2.3h of database time in pg_stat_statements) and run an RLS
-- check per subscriber for every change, which drained the Disk IO budget.
-- Triggers here call realtime.send instead, into two private topics:
--   room:<conversation id>  members of that DM room or server channel (existing
--                           policy). Events: messages, message_attachments,
--                           message_reactions, poll_votes, dm_reads.
--   user:<profile id>       only its owner reads it; nobody writes to it (the
--                           triggers send as the function owner). Events:
--                           friendships, user_relationships, dm_members,
--                           dm_activity, channel_activity, dm_rooms, servers,
--                           notifications, server_layout.
-- Payloads carry ids and timestamps only, never message content: clients refetch
-- through RLS as before.
--
-- Deploy this before the client that listens on these topics. The tables stay in
-- the supabase_realtime publication so clients still on v1.3.0 keep working;
-- drop them from it once everyone has updated, which stops the WAL polling.

create or replace function public.realtime_notify(topic text, event text, payload jsonb)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform realtime.send(payload, event, topic, true);
exception when others then
  -- A missed live update is recoverable (clients refetch); a failed write is not.
  raise warning 'realtime_notify % %: %', topic, event, sqlerrm;
end
$$;

revoke all on function public.realtime_notify(text, text, jsonb) from public, anon, authenticated;

-- Topic access ----------------------------------------------------------------

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
    when topic ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then not for_write and split_part(topic, ':', 2)::uuid = auth.uid()
    else false
  end
$$;

-- Fan-out helpers ---------------------------------------------------------------

create or replace function public.notify_dm_members(target_room_id uuid, event text, payload jsonb)
returns void
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.realtime_notify('user:' || dm.profile_id, event, payload)
  from public.dm_members dm
  where dm.dm_room_id = target_room_id;
$$;

-- shortcut: one send per server member; move to a server topic if servers grow past ~100 members.
create or replace function public.notify_server_members(target_server_id uuid, event text, payload jsonb)
returns void
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.realtime_notify('user:' || sm.profile_id, event, payload)
  from public.server_members sm
  where sm.server_id = target_server_id;
$$;

revoke all on function public.notify_dm_members(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_server_members(uuid, text, jsonb) from public, anon, authenticated;

-- messages ----------------------------------------------------------------------

create or replace function public.broadcast_message_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.messages := case when tg_op = 'DELETE' then old else new end;
  payload jsonb := jsonb_build_object(
    'type', tg_op,
    'id', r.id,
    'profile_id', r.profile_id,
    'created_at', r.created_at,
    'dm_room_id', r.dm_room_id,
    'channel_id', r.channel_id,
    'thread_root_id', r.thread_root_id
  );
  target_server_id uuid;
begin
  if coalesce(r.dm_room_id, r.channel_id) is null then
    return null;
  end if;

  perform public.realtime_notify('room:' || coalesce(r.dm_room_id, r.channel_id), 'messages', payload);

  if tg_op = 'INSERT' and r.dm_room_id is not null then
    -- Sidebar order and unread dots; the sender's own list reorders too.
    perform public.notify_dm_members(r.dm_room_id, 'dm_activity', payload);
  elsif tg_op = 'INSERT' and r.channel_id is not null then
    select cat.server_id into target_server_id
    from public.channels ch join public.categories cat on cat.id = ch.category_id
    where ch.id = r.channel_id;

    -- Unread dots: only members who can see the channel, never the sender.
    perform public.realtime_notify('user:' || sm.profile_id, 'channel_activity', payload)
    from public.server_members sm
    where sm.server_id = target_server_id
      and sm.profile_id <> r.profile_id
      and public.can_view_channel(r.channel_id, sm.profile_id);
  end if;

  return null;
end
$$;

drop trigger if exists broadcast_message_change on public.messages;
create trigger broadcast_message_change
  after insert or update or delete on public.messages
  for each row execute function public.broadcast_message_change();

-- Rows that belong to a message: attachments, reactions, poll votes.
create or replace function public.broadcast_message_child_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  target_message_id uuid := (to_jsonb(case when tg_op = 'DELETE' then old else new end) ->> 'message_id')::uuid;
  room_id uuid;
begin
  select coalesce(m.dm_room_id, m.channel_id) into room_id
  from public.messages m where m.id = target_message_id;

  -- Gone with its message (cascade): the messages DELETE already went out.
  if room_id is not null then
    perform public.realtime_notify('room:' || room_id, tg_table_name,
      jsonb_build_object('type', tg_op, 'message_id', target_message_id));
  end if;
  return null;
end
$$;

drop trigger if exists broadcast_message_child_change on public.message_attachments;
create trigger broadcast_message_child_change
  after insert or update or delete on public.message_attachments
  for each row execute function public.broadcast_message_child_change();

drop trigger if exists broadcast_message_child_change on public.message_reactions;
create trigger broadcast_message_child_change
  after insert or update or delete on public.message_reactions
  for each row execute function public.broadcast_message_child_change();

drop trigger if exists broadcast_message_child_change on public.poll_votes;
create trigger broadcast_message_child_change
  after insert or update or delete on public.poll_votes
  for each row execute function public.broadcast_message_child_change();

-- dm_reads: read receipts for the open DM ----------------------------------------

create or replace function public.broadcast_dm_read_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r public.dm_reads := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.realtime_notify('room:' || r.dm_room_id, 'dm_reads', jsonb_build_object(
    'type', tg_op,
    'profile_id', r.profile_id,
    'last_read_at', case when tg_op = 'DELETE' then null else r.last_read_at end
  ));
  return null;
end
$$;

drop trigger if exists broadcast_dm_read_change on public.dm_reads;
create trigger broadcast_dm_read_change
  after insert or update or delete on public.dm_reads
  for each row execute function public.broadcast_dm_read_change();

-- Per-user lists: friends, blocks, DM membership, notifications ------------------

create or replace function public.broadcast_user_list_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  payload jsonb := jsonb_build_object('type', tg_op);
begin
  case tg_table_name
    when 'friendships' then
      perform public.realtime_notify('user:' || (r ->> 'sender_id'), tg_table_name, payload);
      perform public.realtime_notify('user:' || (r ->> 'receiver_id'), tg_table_name, payload);
    when 'user_relationships' then
      perform public.realtime_notify('user:' || (r ->> 'blocker_id'), tg_table_name, payload);
      perform public.realtime_notify('user:' || (r ->> 'blocked_id'), tg_table_name, payload);
    when 'dm_members' then
      -- The member who left no longer has a row, so tell them directly.
      perform public.notify_dm_members((r ->> 'dm_room_id')::uuid, tg_table_name, payload);
      if tg_op = 'DELETE' then
        perform public.realtime_notify('user:' || (r ->> 'profile_id'), tg_table_name, payload);
      end if;
    when 'notifications' then
      -- The full row: the client announces invites from it without a fetch.
      perform public.realtime_notify('user:' || (r ->> 'recipient_id'), tg_table_name,
        payload || jsonb_build_object('new', case when tg_op = 'DELETE' then null else r end));
  end case;
  return null;
end
$$;

drop trigger if exists broadcast_user_list_change on public.friendships;
create trigger broadcast_user_list_change
  after insert or update or delete on public.friendships
  for each row execute function public.broadcast_user_list_change();

drop trigger if exists broadcast_user_list_change on public.user_relationships;
create trigger broadcast_user_list_change
  after insert or update or delete on public.user_relationships
  for each row execute function public.broadcast_user_list_change();

drop trigger if exists broadcast_user_list_change on public.dm_members;
create trigger broadcast_user_list_change
  after insert or update or delete on public.dm_members
  for each row execute function public.broadcast_user_list_change();

drop trigger if exists broadcast_user_list_change on public.notifications;
create trigger broadcast_user_list_change
  after insert or update or delete on public.notifications
  for each row execute function public.broadcast_user_list_change();

-- Themes: dm_rooms and servers ----------------------------------------------------

create or replace function public.broadcast_dm_room_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.theme_color, new.theme_id, new.wallpaper) is not distinct from (old.theme_color, old.theme_id, old.wallpaper) then
    return null;
  end if;
  perform public.notify_dm_members(new.id, 'dm_rooms', jsonb_build_object(
    'id', new.id, 'theme_color', new.theme_color, 'theme_id', new.theme_id, 'wallpaper', new.wallpaper
  ));
  return null;
end
$$;

drop trigger if exists broadcast_dm_room_change on public.dm_rooms;
create trigger broadcast_dm_room_change
  after update on public.dm_rooms
  for each row execute function public.broadcast_dm_room_change();

create or replace function public.broadcast_server_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new is not distinct from old then
    return null;
  end if;
  -- Members already read the whole row through servers RLS.
  perform public.notify_server_members(new.id, 'servers', to_jsonb(new));
  return null;
end
$$;

drop trigger if exists broadcast_server_change on public.servers;
create trigger broadcast_server_change
  after update on public.servers
  for each row execute function public.broadcast_server_change();

-- Server layout: categories and channels (server_roles adds its own tables) ---------

create or replace function public.broadcast_server_layout_change()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  target_server_id uuid;
begin
  if tg_table_name = 'channels' then
    -- Every channel message bumps last_message_at; channel_activity covers that.
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'last_message_at') = (to_jsonb(old) - 'last_message_at') then
      return null;
    end if;
    select cat.server_id into target_server_id
    from public.categories cat where cat.id = (r ->> 'category_id')::uuid;
  else
    target_server_id := (r ->> 'server_id')::uuid;
  end if;

  -- Null when the category went first (cascade): its own DELETE already went out.
  if target_server_id is not null then
    perform public.notify_server_members(target_server_id, 'server_layout',
      jsonb_build_object('server_id', target_server_id));
  end if;
  return null;
end
$$;

drop trigger if exists broadcast_server_layout_change on public.categories;
create trigger broadcast_server_layout_change
  after insert or update or delete on public.categories
  for each row execute function public.broadcast_server_layout_change();

drop trigger if exists broadcast_server_layout_change on public.channels;
create trigger broadcast_server_layout_change
  after insert or update or delete on public.channels
  for each row execute function public.broadcast_server_layout_change();

-- Trigger-only functions: nobody calls these directly.
revoke all on function public.broadcast_message_change() from public, anon, authenticated;
revoke all on function public.broadcast_message_child_change() from public, anon, authenticated;
revoke all on function public.broadcast_dm_read_change() from public, anon, authenticated;
revoke all on function public.broadcast_user_list_change() from public, anon, authenticated;
revoke all on function public.broadcast_dm_room_change() from public, anon, authenticated;
revoke all on function public.broadcast_server_change() from public, anon, authenticated;
revoke all on function public.broadcast_server_layout_change() from public, anon, authenticated;
