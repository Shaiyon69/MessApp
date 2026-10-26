-- Stored notification feed: mentions and replies in server channels, written
-- by a trigger so a message sent while you were away is still waiting when
-- you open the app. DMs are left out on purpose: their content is ciphertext,
-- so the server cannot see a mention, and every DM already pushes.
--
-- Mention matching is the same squashed form as src/lib/mentions.js and the
-- push function: "@JaneDoe" mentions "Jane Doe".

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('mention', 'reply')),
  message_id uuid not null references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- One row per person per message: a reply that also mentions you is a reply.
  unique (recipient_id, message_id)
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

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

  if new.reply_to_message_id is not null then
    select profile_id into reply_author
    from public.messages
    where id = new.reply_to_message_id and channel_id = new.channel_id;

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

revoke all on function public.notify_channel_message() from public, anon, authenticated;

drop trigger if exists notify_channel_message on public.messages;
create trigger notify_channel_message
  after insert on public.messages
  for each row execute function public.notify_channel_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
