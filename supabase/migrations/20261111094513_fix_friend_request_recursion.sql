-- Friend requests failed with 42P17 "infinite recursion detected in policy for
-- relation friendships": the insert check read profiles.allow_friend_requests
-- under RLS, and profiles_select_related reads friendships back. A security
-- definer helper reads the flag without profiles RLS and breaks the loop.
-- It exposes one boolean per profile id, which search_profiles_for_friend
-- already filters on.

create or replace function public.accepts_friend_requests(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.allow_friend_requests from public.profiles p where p.id = target_profile_id),
    true
  )
$$;

revoke all on function public.accepts_friend_requests(uuid) from public, anon;
grant execute on function public.accepts_friend_requests(uuid) to authenticated;

drop policy if exists "friendships_request_self" on public.friendships;
create policy "friendships_request_self"
on public.friendships
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and receiver_id <> (select auth.uid())
  and not public.users_blocked(sender_id, receiver_id)
  and public.accepts_friend_requests(receiver_id)
);
