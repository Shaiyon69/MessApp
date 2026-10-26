-- Moderation log for server moderators. A plain select on
-- server_moderation_events cannot name kicked or banned members: they no longer
-- share a server with the reader, so profiles_select_related hides them. This
-- returns only usernames, and only to moderators of that server.

create or replace function public.get_server_moderation_log(
  target_server_id uuid,
  max_rows integer default 50
) returns table (
  id uuid,
  action text,
  reason text,
  metadata jsonb,
  created_at timestamptz,
  actor_username text,
  target_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    event.id,
    event.action,
    event.reason,
    event.metadata,
    event.created_at,
    actor.username,
    target.username
  from public.server_moderation_events event
  left join public.profiles actor on actor.id = event.actor_id
  left join public.profiles target on target.id = event.target_profile_id
  where event.server_id = target_server_id
    and public.is_server_moderator(target_server_id)
  order by event.created_at desc
  limit least(greatest(coalesce(max_rows, 50), 1), 100);
$$;

revoke all on function public.get_server_moderation_log(uuid, integer) from public, anon;
grant execute on function public.get_server_moderation_log(uuid, integer) to authenticated, service_role;
