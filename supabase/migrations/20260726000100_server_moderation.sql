-- Server-scoped moderation with role hierarchy and an immutable audit trail.

create table if not exists public.server_moderation_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_message_id uuid,
  action text not null check (action in ('kick', 'ban', 'unban', 'role_change', 'message_delete')),
  reason text check (reason is null or char_length(reason) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.server_moderation_events enable row level security;

drop policy if exists server_moderation_events_read_moderators on public.server_moderation_events;
create policy server_moderation_events_read_moderators
  on public.server_moderation_events
  for select
  to authenticated
  using (public.is_server_moderator(server_id));

revoke all on public.server_moderation_events from public, anon;
grant select on public.server_moderation_events to authenticated;
grant all on public.server_moderation_events to service_role;

create table if not exists public.server_notification_preferences (
  server_id uuid not null references public.servers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  muted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (server_id, profile_id)
);

alter table public.server_notification_preferences enable row level security;

drop policy if exists server_notification_preferences_self on public.server_notification_preferences;
create policy server_notification_preferences_self
  on public.server_notification_preferences
  to authenticated
  using (profile_id = auth.uid() and public.is_server_member(server_id))
  with check (profile_id = auth.uid() and public.is_server_member(server_id));

revoke all on public.server_notification_preferences from public, anon;
grant select, insert, update, delete on public.server_notification_preferences to authenticated;
grant all on public.server_notification_preferences to service_role;

-- Staff removals must go through the hierarchy-checked RPC below. Members can
-- still leave by deleting their own membership through the existing flow.
drop policy if exists server_members_delete_self_or_mod on public.server_members;
create policy server_members_delete_self
  on public.server_members
  for delete
  to authenticated
  using (profile_id = auth.uid());

create or replace function public.kick_server_member(
  target_server_id uuid,
  target_profile_id uuid,
  kick_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  target_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if target_profile_id is null or target_profile_id = actor then
    raise exception 'use leave server for your own membership';
  end if;
  if kick_reason is not null and char_length(trim(kick_reason)) > 500 then
    raise exception 'removal reason is too long';
  end if;

  select role into actor_role
  from public.server_members
  where server_id = target_server_id and profile_id = actor;

  select role into target_role
  from public.server_members
  where server_id = target_server_id and profile_id = target_profile_id
  for update;

  if actor_role not in ('owner', 'admin', 'moderator') then
    raise exception 'moderator access required';
  end if;
  if target_role is null then raise exception 'member not found'; end if;
  if target_role = 'owner'
    or (actor_role = 'admin' and target_role = 'admin')
    or (actor_role = 'moderator' and target_role <> 'member') then
    raise exception 'this member is protected';
  end if;

  delete from public.server_members
  where server_id = target_server_id and profile_id = target_profile_id;

  insert into public.server_moderation_events(
    server_id, actor_id, target_profile_id, action, reason
  ) values (
    target_server_id, actor, target_profile_id, 'kick', nullif(trim(kick_reason), '')
  );
end;
$$;

create or replace function public.ban_server_member(
  target_server_id uuid,
  target_profile_id uuid,
  ban_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  target_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if target_profile_id is null or target_profile_id = actor then
    raise exception 'use leave server for your own membership';
  end if;
  if ban_reason is not null and char_length(trim(ban_reason)) > 500 then
    raise exception 'ban reason is too long';
  end if;

  select role into actor_role
  from public.server_members
  where server_id = target_server_id and profile_id = actor;

  select role into target_role
  from public.server_members
  where server_id = target_server_id and profile_id = target_profile_id
  for update;

  if actor_role not in ('owner', 'admin') then raise exception 'manager access required'; end if;
  if target_role is null then raise exception 'member not found'; end if;
  if target_role = 'owner' or (actor_role = 'admin' and target_role in ('owner', 'admin')) then
    raise exception 'this member is protected';
  end if;

  insert into public.server_bans(server_id, profile_id, banned_by, reason)
  values (target_server_id, target_profile_id, actor, nullif(trim(ban_reason), ''))
  on conflict (server_id, profile_id) do update
    set banned_by = excluded.banned_by, reason = excluded.reason, created_at = now();

  delete from public.server_members
  where server_id = target_server_id and profile_id = target_profile_id;

  insert into public.server_moderation_events(
    server_id, actor_id, target_profile_id, action, reason
  ) values (
    target_server_id, actor, target_profile_id, 'ban', nullif(trim(ban_reason), '')
  );
end;
$$;

create or replace function public.set_server_member_role(
  target_server_id uuid,
  target_profile_id uuid,
  new_role text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  old_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if new_role not in ('admin', 'moderator', 'member') then raise exception 'unsupported role'; end if;
  if not exists (
    select 1 from public.servers where id = target_server_id and owner_id = actor
  ) then
    raise exception 'owner access required';
  end if;
  if target_profile_id = actor then raise exception 'owner role cannot be changed here'; end if;

  select role into old_role
  from public.server_members
  where server_id = target_server_id and profile_id = target_profile_id
  for update;

  if old_role is null or old_role = 'owner' then raise exception 'member not found or protected'; end if;
  if old_role = new_role then return; end if;

  update public.server_members
  set role = new_role
  where server_id = target_server_id and profile_id = target_profile_id;

  insert into public.server_moderation_events(
    server_id, actor_id, target_profile_id, action, metadata
  ) values (
    target_server_id,
    actor,
    target_profile_id,
    'role_change',
    jsonb_build_object('from', old_role, 'to', new_role)
  );
end;
$$;

create or replace function public.moderate_server_message(
  target_message_id uuid,
  moderation_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  author_id uuid;
  author_role text;
  target_server_id uuid;
  target_channel_id uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if moderation_reason is not null and char_length(trim(moderation_reason)) > 500 then
    raise exception 'moderation reason is too long';
  end if;

  select m.profile_id, m.channel_id, cat.server_id
    into author_id, target_channel_id, target_server_id
  from public.messages m
  join public.channels ch on ch.id = m.channel_id
  join public.categories cat on cat.id = ch.category_id
  where m.id = target_message_id
  for update of m;

  if target_server_id is null then raise exception 'server message not found'; end if;

  select role into actor_role
  from public.server_members
  where server_id = target_server_id and profile_id = actor;

  select role into author_role
  from public.server_members
  where server_id = target_server_id and profile_id = author_id;

  if actor_role not in ('owner', 'admin', 'moderator') then
    raise exception 'moderator access required';
  end if;
  if author_id <> actor and (
    author_role = 'owner'
    or (actor_role = 'admin' and author_role = 'admin')
    or (actor_role = 'moderator' and author_role in ('owner', 'admin'))
  ) then
    raise exception 'this message author is protected';
  end if;

  delete from public.messages where id = target_message_id;

  insert into public.server_moderation_events(
    server_id, actor_id, target_profile_id, target_message_id, action, reason, metadata
  ) values (
    target_server_id,
    actor,
    author_id,
    target_message_id,
    'message_delete',
    nullif(trim(moderation_reason), ''),
    jsonb_build_object('channel_id', target_channel_id)
  );
end;
$$;

revoke all on function public.kick_server_member(uuid, uuid, text) from public;
grant execute on function public.kick_server_member(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.moderate_server_message(uuid, text) from public;
grant execute on function public.moderate_server_message(uuid, text) to authenticated, service_role;

revoke all on function public.ban_server_member(uuid, uuid, text) from public;
grant execute on function public.ban_server_member(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.set_server_member_role(uuid, uuid, text) from public;
grant execute on function public.set_server_member_role(uuid, uuid, text) to authenticated, service_role;
