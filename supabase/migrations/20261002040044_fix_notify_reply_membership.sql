-- Reply notifications never fired: is_channel_member(channel, profile) only
-- returns true when profile is auth.uid(), and inside the trigger the recipient
-- is someone else.

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

  -- is_channel_member() only answers for auth.uid(), so membership of the
  -- recipient is checked inline.
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
        select lower(mention_match.parts[2])
        from regexp_matches(new.content, '(^|\s)@([[:alnum:]_.-]{1,32})', 'g') as mention_match(parts)
      )
    on conflict (recipient_id, message_id) do nothing;
  end if;

  return new;
end;
$$;
