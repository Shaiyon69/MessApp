-- Threads in server channels: a reply with thread_root_id set lives in the
-- root message's thread instead of the channel. The root carries a reply count
-- and last-reply time so the channel view can show "3 replies" without a query
-- per message; the count rides the root's realtime UPDATE to everyone.
--
-- Server channels only. DM threads would work cryptographically, but the 1:1
-- conversation has no need for them.
--
-- ponytail: thread_reply_count is a plain column, so a message's author could
-- overwrite it on their own message through the existing update policy. It is
-- display-only; move it behind a column grant if that ever matters.

alter table public.messages
  add column if not exists thread_root_id uuid references public.messages(id) on delete cascade,
  add column if not exists thread_reply_count integer not null default 0,
  add column if not exists thread_last_reply_at timestamptz;

create index if not exists messages_thread_root_created_idx
  on public.messages (thread_root_id, created_at)
  where thread_root_id is not null;

create or replace function public.enforce_message_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reply_message public.messages;
  root_message public.messages;
begin
  if tg_op = 'UPDATE' and (
    new.profile_id is distinct from old.profile_id
    or new.channel_id is distinct from old.channel_id
    or new.dm_room_id is distinct from old.dm_room_id
    or new.created_at is distinct from old.created_at
    or new.thread_root_id is distinct from old.thread_root_id
  ) then
    raise exception 'message author and conversation are immutable';
  end if;
  if new.reply_to_message_id is not null then
    select * into reply_message from public.messages where id = new.reply_to_message_id;
    if reply_message.id is null
      or reply_message.channel_id is distinct from new.channel_id
      or reply_message.dm_room_id is distinct from new.dm_room_id then
      raise exception 'reply target must belong to the same conversation';
    end if;
  end if;
  if tg_op = 'INSERT' and new.thread_root_id is not null then
    select * into root_message from public.messages where id = new.thread_root_id;
    if new.channel_id is null
      or root_message.id is null
      or root_message.channel_id is distinct from new.channel_id
      or root_message.thread_root_id is not null then
      raise exception 'thread root must be a top-level message in the same channel';
    end if;
  end if;
  return new;
end $$;

create or replace function public.bump_thread_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.messages
  set thread_reply_count = thread_reply_count + 1,
      thread_last_reply_at = new.created_at
  where id = new.thread_root_id;
  return new;
end;
$$;

revoke all on function public.bump_thread_reply_count() from public, anon, authenticated;

drop trigger if exists messages_bump_thread_reply_count on public.messages;
create trigger messages_bump_thread_reply_count
  after insert on public.messages
  for each row
  when (new.thread_root_id is not null)
  execute function public.bump_thread_reply_count();

-- A thread reply notifies the root's author, the same way a reply does.
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
    select profile_id into reply_author
    from public.messages
    where id = coalesce(new.reply_to_message_id, new.thread_root_id) and channel_id = new.channel_id;

    if reply_author is not null
      and reply_author <> new.profile_id
      and public.is_channel_member(new.channel_id, reply_author) then
      insert into public.notifications(recipient_id, actor_id, kind, message_id, channel_id)
      values (reply_author, new.profile_id, 'reply', new.id, new.channel_id)
      on conflict (recipient_id, message_id) do nothing;
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
        select lower(found[2])
        from regexp_matches(new.content, '(^|\s)@([[:alnum:]_.-]{1,32})', 'g') as found
      )
    on conflict (recipient_id, message_id) do nothing;
  end if;

  return new;
end;
$$;
