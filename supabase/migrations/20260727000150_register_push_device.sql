-- Atomically assigns a provider token to the authenticated account. This avoids
-- stale-account delivery when multiple accounts use the same app installation.

create or replace function public.register_push_device(
  target_installation_id text,
  target_platform text,
  target_push_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  existing_token text;
  existing_enabled boolean;
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if char_length(coalesce(target_installation_id, '')) not between 16 and 200
     or target_platform not in ('android', 'ios', 'web')
     or char_length(coalesce(target_push_token, '')) not between 1 and 8192 then
    raise exception using errcode = '22023', message = 'Invalid push-device registration';
  end if;

  select push_token, enabled
    into existing_token, existing_enabled
    from public.push_devices
   where profile_id = caller_id
     and installation_id = target_installation_id
   for update;

  -- A provider token identifies one app installation. Possession of the current
  -- token allows that installation to move it away from a previously signed-in
  -- account without exposing or returning the prior account row.
  update public.push_devices
     set enabled = false,
         last_seen_at = now()
   where md5(push_token) = md5(target_push_token)
     and enabled
     and (profile_id <> caller_id or installation_id <> target_installation_id);

  insert into public.push_devices (
    profile_id,
    installation_id,
    platform,
    push_token,
    enabled,
    last_seen_at
  ) values (
    caller_id,
    target_installation_id,
    target_platform,
    target_push_token,
    true,
    now()
  )
  on conflict (profile_id, installation_id) do update
    set platform = excluded.platform,
        push_token = excluded.push_token,
        enabled = true,
        last_seen_at = excluded.last_seen_at;

  return jsonb_build_object(
    'refreshed', existing_token is not null and existing_token <> target_push_token,
    'reenabled', existing_token is not null and not coalesce(existing_enabled, false),
    'platform', target_platform,
    'installationId', target_installation_id
  );
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;
