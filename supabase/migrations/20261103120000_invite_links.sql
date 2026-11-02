-- Invite links: any member can invite (Discord's default), invites can be
-- previewed before joining, and an invite can be sent to a friend as a
-- notification, optionally pointing at a voice channel to join.
--
-- The invites table already carries uses_left (null = unlimited), expires_at
-- (null = never) and revoked_at, so links need no new columns.

-- Any member may create an invite. Managers still see and revoke every one;
-- a member sees and revokes the ones they made.
create or replace function public.create_server_invite(
  target_server_id uuid,
  requested_uses integer default 100,
  requested_expires_at timestamptz default null
) returns public.invites
language plpgsql security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare actor uuid := auth.uid(); created_invite public.invites; generated_code text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if not public.is_server_member(target_server_id, actor) then raise exception 'membership required'; end if;
  if requested_uses is not null and requested_uses not between 1 and 10000 then raise exception 'uses must be between 1 and 10000'; end if;
  if requested_expires_at is not null and requested_expires_at <= now() then raise exception 'expiry must be in the future'; end if;
  loop
    generated_code := upper(substr(encode(extensions.messapp_random_bytes(9), 'hex'), 1, 12));
    exit when not exists (select 1 from public.invites where upper(code) = generated_code);
  end loop;
  insert into public.invites(server_id, created_by, code, uses_left, expires_at)
  values (target_server_id, actor, generated_code, requested_uses, requested_expires_at)
  returning * into created_invite;
  return created_invite;
end $$;

create or replace function public.revoke_server_invite(target_invite_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare actor uuid := auth.uid(); target public.invites;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into target from public.invites where id = target_invite_id for update;
  if target.id is null then raise exception 'invalid invite'; end if;
  if target.created_by is distinct from actor and not public.can_manage_server(target.server_id, actor) then
    raise exception 'manager access required';
  end if;
  update public.invites set revoked_at = now() where id = target_invite_id and revoked_at is null;
end $$;

drop policy if exists invites_read_creator on public.invites;
create policy invites_read_creator on public.invites
  for select to authenticated
  using (created_by = (select auth.uid()));

-- What an invite link shows before you join. Only the server's public face:
-- name, picture and member count. An unknown code says 'invalid' and nothing
-- else, so codes cannot be probed for server details.
create or replace function public.preview_invite(invite text)
returns table (
  server_id uuid,
  server_name text,
  icon_url text,
  member_count integer,
  status text,
  is_member boolean
)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare actor uuid := auth.uid(); matched public.invites; target public.servers;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into matched from public.invites where upper(code) = upper(trim(coalesce(invite, '')));
  if matched.id is null then
    return query select null::uuid, null::text, null::text, null::integer, 'invalid'::text, false;
    return;
  end if;
  select * into target from public.servers where id = matched.server_id;
  if target.id is null then
    return query select null::uuid, null::text, null::text, null::integer, 'invalid'::text, false;
    return;
  end if;
  return query select
    target.id,
    target.name,
    target.icon_url,
    (select count(*)::integer from public.server_members where server_members.server_id = target.id),
    case
      when matched.revoked_at is not null then 'revoked'
      when matched.expires_at is not null and matched.expires_at <= now() then 'expired'
      when matched.uses_left is not null and matched.uses_left <= 0 then 'exhausted'
      else 'valid'
    end,
    exists (select 1 from public.server_members where server_members.server_id = target.id and profile_id = actor);
end $$;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'thread_reply', 'reaction', 'poll_vote', 'missed_call', 'friend_accepted', 'moderation', 'server_invite', 'voice_invite'));

-- Sends an invite to a friend's notification feed. With a voice channel it
-- becomes a "join me in voice" invite. The recipient must be an accepted
-- friend and neither side may have blocked the other.
create or replace function public.send_server_invite(
  invite text,
  recipient uuid,
  voice_channel uuid default null
) returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor uuid := auth.uid();
  matched public.invites;
  target public.servers;
  voice_id uuid;
  voice_name text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if recipient is null or recipient = actor then raise exception 'invalid recipient'; end if;
  select * into matched from public.invites where upper(code) = upper(trim(coalesce(invite, '')));
  if matched.id is null or matched.revoked_at is not null
     or (matched.expires_at is not null and matched.expires_at <= now())
     or (matched.uses_left is not null and matched.uses_left <= 0) then
    raise exception 'invalid invite';
  end if;
  if not public.is_server_member(matched.server_id, actor) then raise exception 'membership required'; end if;
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((sender_id = actor and receiver_id = recipient) or (sender_id = recipient and receiver_id = actor))
  ) then
    raise exception 'friends only';
  end if;
  if public.users_blocked(actor, recipient) then raise exception 'recipient unavailable'; end if;
  select * into target from public.servers where id = matched.server_id;

  if voice_channel is not null then
    select ch.id, ch.name into voice_id, voice_name
    from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    where ch.id = voice_channel and ch.type = 'voice' and cat.server_id = matched.server_id;
    if voice_id is null then raise exception 'invalid voice channel'; end if;
  end if;

  insert into public.notifications(recipient_id, actor_id, kind, server_id, data)
  values (
    recipient,
    actor,
    case when voice_channel is null then 'server_invite' else 'voice_invite' end,
    matched.server_id,
    jsonb_strip_nulls(jsonb_build_object(
      'code', matched.code,
      'server_name', target.name,
      'server_icon', target.icon_url,
      'channel_id', voice_id,
      'channel_name', voice_name
    ))
  );
end $$;

revoke all on function public.create_server_invite(uuid, integer, timestamptz) from public, anon;
revoke all on function public.revoke_server_invite(uuid) from public, anon;
revoke all on function public.preview_invite(text) from public, anon;
revoke all on function public.send_server_invite(text, uuid, uuid) from public, anon;
grant execute on function public.create_server_invite(uuid, integer, timestamptz) to authenticated;
grant execute on function public.revoke_server_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to authenticated;
grant execute on function public.send_server_invite(text, uuid, uuid) to authenticated;
