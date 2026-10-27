-- More notification kinds: thread activity, reactions, poll votes, missed
-- calls, accepted friend requests and moderation actions against you.
--
-- Rows not tied to a channel message (calls, friendships, moderation) leave
-- message_id/channel_id null. `data` snapshots what the recipient may lose read
-- access to later (a server name after a kick) or what a grouped row counts.
--
-- Grouped kinds (reaction, poll_vote, thread_reply) keep one row per recipient
-- per message; a new event bumps it back to unread instead of adding a row.
--
-- Recipient checks are inline: is_channel_member/is_dm_member only answer for
-- auth.uid(), and inside a trigger the recipient is someone else.

alter table public.notifications alter column message_id drop not null;
alter table public.notifications alter column channel_id drop not null;
alter table public.notifications
  add column if not exists dm_room_id uuid references public.dm_rooms(id) on delete cascade,
  add column if not exists server_id uuid references public.servers(id) on delete cascade,
  add column if not exists data jsonb not null default '{}'::jsonb;

create index if not exists notifications_dm_room_id_idx on public.notifications (dm_room_id);
create index if not exists notifications_server_id_idx on public.notifications (server_id);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'thread_reply', 'reaction', 'poll_vote', 'missed_call', 'friend_accepted', 'moderation'));

alter table public.notifications drop constraint if exists notifications_recipient_id_message_id_key;
create unique index if not exists notifications_message_once_idx
  on public.notifications (recipient_id, message_id)
  where kind in ('mention', 'reply');
create unique index if not exists notifications_grouped_idx
  on public.notifications (recipient_id, kind, message_id)
  where kind in ('reaction', 'poll_vote', 'thread_reply');

-- Mentions and replies as before, plus one grouped row per thread participant.
create or replace function public.notify_channel_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reply_author uuid;
begin
  if new.channel_id is null or coalesce(new.is_deleted, false) then
    return new;
  end if;

  if coalesce(new.reply_to_message_id, new.thread_root_id) is not null then
    select m.profile_id into reply_author
    from public.messages m
    join public.channels ch on ch.id = m.channel_id
    join public.categories cat on cat.id = ch.category_id
    join public.server_members sm on sm.server_id = cat.server_id and sm.profile_id = m.profile_id
    where m.id = coalesce(new.reply_to_message_id, new.thread_root_id)
      and m.channel_id = new.channel_id;

    if reply_author is not null and reply_author <> new.profile_id then
      insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id)
      values (reply_author, new.profile_id, 'reply', new.id, new.channel_id)
      on conflict (recipient_id, message_id) where kind in ('mention', 'reply') do nothing;
    end if;
  end if;

  if position('@' in new.content) > 0 then
    insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id)
    select distinct sm.profile_id, new.profile_id, 'mention', new.id, new.channel_id
    from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    join public.server_members sm on sm.server_id = cat.server_id
    join public.profiles p on p.id = sm.profile_id
    where ch.id = new.channel_id
      and sm.profile_id <> new.profile_id
      and lower(regexp_replace(p.username, '\s+', '', 'g')) in (
        select lower(mention_match.parts[2])
        from regexp_matches(new.content, '(^|\s)@([[:alnum:]_.-]{1,32})', 'g') as mention_match(parts)
      )
    on conflict (recipient_id, message_id) where kind in ('mention', 'reply') do nothing;
  end if;

  -- Everyone else in the thread, unless this message already notified them.
  if new.thread_root_id is not null then
    insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id, data)
    select people.participant, new.profile_id, 'thread_reply', new.thread_root_id, new.channel_id,
      jsonb_build_object('count', (
        select count(distinct t.profile_id) from public.messages t
        where t.thread_root_id = new.thread_root_id and t.profile_id <> people.participant
      ))
    from (
      select m.profile_id as participant from public.messages m where m.id = new.thread_root_id
      union
      select m.profile_id from public.messages m where m.thread_root_id = new.thread_root_id
    ) people
    where people.participant <> new.profile_id
      and exists (
        select 1 from public.channels ch
        join public.categories cat on cat.id = ch.category_id
        join public.server_members sm on sm.server_id = cat.server_id and sm.profile_id = people.participant
        where ch.id = new.channel_id
      )
      and not exists (
        select 1 from public.notifications n
        where n.recipient_id = people.participant and n.message_id = new.id
      )
    on conflict (recipient_id, kind, message_id) where kind in ('reaction', 'poll_vote', 'thread_reply')
    do update set actor_id = excluded.actor_id, created_at = now(), read_at = null, data = excluded.data;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_channel_message() from public, anon, authenticated;

-- Reactions on your message, in a channel you are still in or a DM.
create or replace function public.notify_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.messages;
  reactors integer;
begin
  select * into target from public.messages where id = new.message_id;
  if target.id is null or target.profile_id = new.profile_id or coalesce(target.is_deleted, false) then
    return new;
  end if;
  if target.channel_id is not null and not exists (
    select 1 from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    join public.server_members sm on sm.server_id = cat.server_id and sm.profile_id = target.profile_id
    where ch.id = target.channel_id
  ) then
    return new;
  end if;

  select count(distinct profile_id) into reactors
  from public.message_reactions
  where message_id = target.id and profile_id <> target.profile_id;

  insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id, dm_room_id, data)
  values (target.profile_id, new.profile_id, 'reaction', target.id, target.channel_id, target.dm_room_id,
    jsonb_build_object('emoji', new.emoji, 'count', reactors))
  on conflict (recipient_id, kind, message_id) where kind in ('reaction', 'poll_vote', 'thread_reply')
  do update set actor_id = excluded.actor_id, created_at = now(), read_at = null, data = excluded.data;

  return new;
end;
$$;

revoke all on function public.notify_message_reaction() from public, anon, authenticated;

drop trigger if exists notify_message_reaction on public.message_reactions;
create trigger notify_message_reaction
  after insert on public.message_reactions
  for each row execute function public.notify_message_reaction();

-- Votes on your poll. vote_poll inserts one row per picked option; the upsert
-- recounts voters, so repeats are harmless.
create or replace function public.notify_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author uuid;
  poll public.polls;
  voters integer;
begin
  select * into poll from public.polls where message_id = new.message_id;
  select profile_id into author from public.messages where id = new.message_id;
  if author is null or author = new.profile_id then
    return new;
  end if;

  select count(distinct profile_id) into voters
  from public.poll_votes
  where message_id = new.message_id and profile_id <> author;

  insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id, data)
  values (author, new.profile_id, 'poll_vote', new.message_id, poll.channel_id,
    jsonb_build_object('count', voters, 'question', poll.question))
  on conflict (recipient_id, kind, message_id) where kind in ('reaction', 'poll_vote', 'thread_reply')
  do update set actor_id = excluded.actor_id, created_at = now(), read_at = null, data = excluded.data;

  return new;
end;
$$;

revoke all on function public.notify_poll_vote() from public, anon, authenticated;

drop trigger if exists notify_poll_vote on public.poll_votes;
create trigger notify_poll_vote
  after insert on public.poll_votes
  for each row execute function public.notify_poll_vote();

-- Fires for accepts from chimaera and messapp alike.
create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications(recipient_id, actor_id, kind)
  values (new.sender_id, new.receiver_id, 'friend_accepted');
  return new;
end;
$$;

revoke all on function public.notify_friend_accepted() from public, anon, authenticated;

drop trigger if exists notify_friend_accepted on public.friendships;
create trigger notify_friend_accepted
  after update of status on public.friendships
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function public.notify_friend_accepted();

-- Moderation against you. The server name is snapshotted: after a kick or ban
-- the servers row is no longer readable to you.
create or replace function public.notify_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.target_profile_id is null or new.target_profile_id = new.actor_id then
    return new;
  end if;

  insert into public.notifications(recipient_id, actor_id, kind, server_id, data)
  select new.target_profile_id, new.actor_id, 'moderation', new.server_id,
    jsonb_build_object('action', new.action, 'server_name', s.name, 'reason', new.reason, 'metadata', new.metadata)
  from public.servers s
  where s.id = new.server_id;

  return new;
end;
$$;

revoke all on function public.notify_moderation_event() from public, anon, authenticated;

drop trigger if exists notify_moderation_event on public.server_moderation_events;
create trigger notify_moderation_event
  after insert on public.server_moderation_events
  for each row execute function public.notify_moderation_event();

-- Called by the caller's client when a 1:1 call goes unanswered. Signaling is
-- a broadcast, so an offline callee never sees the offer; only the caller
-- knows the call happened.
create or replace function public.record_missed_call(target_room_id uuid, is_video boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  callee uuid;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.dm_members where dm_room_id = target_room_id and profile_id = caller)
    or (select count(*) from public.dm_members where dm_room_id = target_room_id) <> 2 then
    raise exception 'conversation not found';
  end if;

  select profile_id into callee
  from public.dm_members
  where dm_room_id = target_room_id and profile_id <> caller;

  if public.users_blocked(caller, callee) then return; end if;
  -- One per caller per 30s: a redial loop cannot flood the feed.
  if exists (
    select 1 from public.notifications
    where recipient_id = callee and actor_id = caller and kind = 'missed_call'
      and created_at > now() - interval '30 seconds'
  ) then
    return;
  end if;

  insert into public.notifications(recipient_id, actor_id, kind, dm_room_id, data)
  values (callee, caller, 'missed_call', target_room_id, jsonb_build_object('video', coalesce(is_video, false)));
end;
$$;

revoke all on function public.record_missed_call(uuid, boolean) from public, anon;
grant execute on function public.record_missed_call(uuid, boolean) to authenticated;
