-- Security + performance hardening from the Supabase advisors.

-- 1. anon never needs to call public functions. Supabase grants EXECUTE to anon
--    directly, so earlier "revoke ... from public" statements did not close this.
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 2. Trigger-only functions: triggers fire without an EXECUTE check, so nobody
--    needs to call them over RPC.
revoke execute on function public.capture_report_snapshot() from public, anon, authenticated;
revoke execute on function public.enforce_channel_server_on_move() from public, anon, authenticated;
revoke execute on function public.enforce_message_integrity() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.queue_deleted_attachment_storage() from public, anon, authenticated;
revoke execute on function public.update_channel_last_message() from public, anon, authenticated;
revoke execute on function public.handle_updated_at() from public, anon, authenticated;

-- 3. Pin search_path on the functions the linter flagged.
alter function public.update_channel_last_message() set search_path = public, pg_temp;
alter function public.handle_updated_at() set search_path = public, pg_temp;
alter function public.delete_user_account() set search_path = public, pg_temp;

-- 4. Evaluate auth.uid()/role()/jwt() once per query, not once per row.
--    Rewrites each policy from its stored definition, so the logic is unchanged.
do $$
declare
  p record;
  pattern constant text := '(?<!SELECT )auth\.(uid|role|jwt)\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ pattern or coalesce(with_check, '') ~ pattern)
  loop
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || case when p.qual is not null
           then ' using (' || regexp_replace(p.qual, pattern, '(select auth.\1())', 'g') || ')'
           else '' end
      || case when p.with_check is not null
           then ' with check (' || regexp_replace(p.with_check, pattern, '(select auth.\1())', 'g') || ')'
           else '' end;
  end loop;
end $$;

-- 5. Index foreign keys that had none.
create index if not exists content_reports_assigned_to_idx on public.content_reports (assigned_to);
create index if not exists content_reports_reported_user_id_idx on public.content_reports (reported_user_id);
create index if not exists dm_members_profile_id_idx on public.dm_members (profile_id);
create index if not exists friendships_receiver_id_idx on public.friendships (receiver_id);
create index if not exists invites_created_by_idx on public.invites (created_by);
create index if not exists message_reactions_profile_id_idx on public.message_reactions (profile_id);
create index if not exists messages_profile_id_idx on public.messages (profile_id);
create index if not exists messages_reply_to_message_id_idx on public.messages (reply_to_message_id);
create index if not exists moderation_actions_moderator_id_idx on public.moderation_actions (moderator_id);
create index if not exists moderation_actions_report_id_idx on public.moderation_actions (report_id);
create index if not exists moderation_actions_subject_user_id_idx on public.moderation_actions (subject_user_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_channel_id_idx on public.notifications (channel_id);
create index if not exists notifications_message_id_idx on public.notifications (message_id);
create index if not exists poll_votes_profile_id_idx on public.poll_votes (profile_id);
create index if not exists polls_channel_id_idx on public.polls (channel_id);
create index if not exists server_bans_banned_by_idx on public.server_bans (banned_by);
create index if not exists server_bans_profile_id_idx on public.server_bans (profile_id);
create index if not exists server_moderation_events_actor_id_idx on public.server_moderation_events (actor_id);
create index if not exists server_moderation_events_target_profile_id_idx on public.server_moderation_events (target_profile_id);
create index if not exists server_notification_preferences_profile_id_idx on public.server_notification_preferences (profile_id);
create index if not exists servers_owner_id_idx on public.servers (owner_id);
create index if not exists storage_deletion_queue_requested_by_idx on public.storage_deletion_queue (requested_by);
create index if not exists user_relationships_blocked_id_idx on public.user_relationships (blocked_id);

-- 6. Drop indexes that duplicate a constraint-backed one (none back a constraint themselves).
drop index if exists public.dm_members_one_per_room_user_idx;
drop index if exists public.message_reactions_one_per_user_idx;
drop index if exists public.user_relationships_unique_pair_idx;
drop index if exists public.idx_friendships_users;
drop index if exists public.idx_user_settings_user_id;
