-- Member timeout: a moderator silences a member in one server until a set time.
-- The member keeps read access; only channel message inserts are refused.

alter table public.server_members
  add column if not exists timed_out_until timestamptz;

alter table public.server_moderation_events
  drop constraint if exists server_moderation_events_action_check;
alter table public.server_moderation_events
  add constraint server_moderation_events_action_check
  check (action in ('kick', 'ban', 'unban', 'role_change', 'message_delete', 'timeout', 'untimeout'));

create or replace function public.is_timed_out_in_channel(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    join public.server_members sm on sm.server_id = cat.server_id
    where ch.id = target_channel_id
      and sm.profile_id = auth.uid()
      and sm.timed_out_until > now()
  );
$$;

revoke all on function public.is_timed_out_in_channel(uuid) from public, anon;
grant execute on function public.is_timed_out_in_channel(uuid) to authenticated;

-- Restrictive, so it narrows messages_insert_authorized without restating it.
drop policy if exists messages_insert_not_timed_out on public.messages;
create policy messages_insert_not_timed_out
  on public.messages
  as restrictive
  for insert
  to authenticated
  with check (channel_id is null or not public.is_timed_out_in_channel(channel_id));

-- duration_minutes null or 0 lifts the timeout. Same hierarchy as kick.
create or replace function public.timeout_server_member(
  target_server_id uuid,
  target_profile_id uuid,
  duration_minutes integer,
  timeout_reason text default null
) returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  target_role text;
  until timestamptz;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if target_profile_id is null or target_profile_id = actor then
    raise exception 'you cannot time out yourself';
  end if;
  if duration_minutes is not null and (duration_minutes < 0 or duration_minutes > 40320) then
    raise exception 'timeout must be between 0 minutes and 28 days';
  end if;
  if timeout_reason is not null and char_length(trim(timeout_reason)) > 500 then
    raise exception 'timeout reason is too long';
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

  until := case when coalesce(duration_minutes, 0) = 0 then null
    else now() + make_interval(mins => duration_minutes) end;

  update public.server_members
  set timed_out_until = until
  where server_id = target_server_id and profile_id = target_profile_id;

  insert into public.server_moderation_events(
    server_id, actor_id, target_profile_id, action, reason, metadata
  ) values (
    target_server_id, actor, target_profile_id,
    case when until is null then 'untimeout' else 'timeout' end,
    nullif(trim(timeout_reason), ''),
    case when until is null then '{}'::jsonb else jsonb_build_object('until', until, 'minutes', duration_minutes) end
  );

  return until;
end;
$$;

revoke all on function public.timeout_server_member(uuid, uuid, integer, text) from public, anon;
grant execute on function public.timeout_server_member(uuid, uuid, integer, text) to authenticated;
