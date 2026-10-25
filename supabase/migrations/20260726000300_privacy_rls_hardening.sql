-- Remove legacy policies whose permissive OR semantics bypass the intended
-- relationship-scoped profile and friendship authorization.

drop policy if exists "Profiles are viewable by everyone." on public.profiles;
drop policy if exists "Public profiles are searchable" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "profiles_read_authenticated" on public.profiles;
drop policy if exists "profiles_select_related" on public.profiles;

create policy "profiles_select_related"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.dm_members mine
    join public.dm_members theirs on theirs.dm_room_id = mine.dm_room_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = profiles.id
  )
  or exists (
    select 1
    from public.server_members mine
    join public.server_members theirs on theirs.server_id = mine.server_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = profiles.id
  )
  or exists (
    select 1
    from public.friendships friendship
    where friendship.status in ('pending', 'accepted')
      and (
        (
          friendship.sender_id = auth.uid()
          and friendship.receiver_id = profiles.id
        ) or (
          friendship.receiver_id = auth.uid()
          and friendship.sender_id = profiles.id
        )
      )
  )
);

revoke all on table public.profiles from anon;
revoke select (id, username, unique_tag) on table public.profiles from anon;
revoke select on table public.profiles from authenticated;
grant select (
  id,
  username,
  avatar_url,
  theme_color,
  unique_tag,
  bio,
  pronouns,
  banner_url,
  public_key,
  allow_dms,
  allow_friend_requests
) on table public.profiles to authenticated;

create or replace function public.search_profiles_for_friend(search_query text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  unique_tag text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar_url, p.unique_tag
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and coalesce(p.allow_friend_requests, true)
    and not public.users_blocked(auth.uid(), p.id)
    and (
      lower(p.unique_tag) = lower(trim(search_query))
      or lower(p.username) = lower(trim(search_query))
    )
  order by (lower(p.unique_tag) = lower(trim(search_query))) desc, p.username
  limit 10;
$$;

revoke all on function public.search_profiles_for_friend(text) from public, anon;
grant execute on function public.search_profiles_for_friend(text) to authenticated;

create or replace function public.get_my_profile_secrets()
returns table (
  encrypted_private_key text,
  public_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.encrypted_private_key, p.public_key
  from public.profiles p
  where auth.uid() is not null
    and p.id = auth.uid();
$$;

revoke all on function public.get_my_profile_secrets() from public, anon;
grant execute on function public.get_my_profile_secrets() to authenticated;

create or replace function public.save_my_profile_key_backup(
  new_encrypted_private_key text,
  new_public_key text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if new_encrypted_private_key is null
    or char_length(new_encrypted_private_key) not between 32 and 65536 then
    raise exception 'Invalid encrypted key backup' using errcode = '22023';
  end if;
  if new_public_key is not null and char_length(new_public_key) > 8192 then
    raise exception 'Invalid public key' using errcode = '22023';
  end if;

  update public.profiles
  set encrypted_private_key = new_encrypted_private_key,
      public_key = coalesce(new_public_key, public_key)
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_my_profile_key_backup(text, text) from public, anon;
grant execute on function public.save_my_profile_key_backup(text, text) to authenticated;

drop policy if exists "Users can create friend requests" on public.friendships;
drop policy if exists "friendships_insert_self" on public.friendships;
drop policy if exists "Users can accept their received requests" on public.friendships;
drop policy if exists "friendships_accept_receiver" on public.friendships;
drop policy if exists "friendships_update_receiver_or_sender" on public.friendships;

create policy "friendships_accept_receiver"
on public.friendships
for update
to authenticated
using (
  receiver_id = auth.uid()
  and status = 'pending'
)
with check (
  receiver_id = auth.uid()
  and status = 'accepted'
);

create or replace function public.enforce_friendship_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.sender_id is distinct from auth.uid() or new.status is distinct from 'pending' then
      raise exception 'Invalid friend request' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.sender_id is distinct from new.sender_id
      or old.receiver_id is distinct from new.receiver_id
      or auth.uid() is distinct from old.receiver_id
      or old.status is distinct from 'pending'
      or new.status is distinct from 'accepted' then
      raise exception 'Invalid friend request transition' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_friendship_integrity() from public, anon, authenticated;

drop trigger if exists friendships_integrity_guard on public.friendships;
create trigger friendships_integrity_guard
before insert or update on public.friendships
for each row execute function public.enforce_friendship_integrity();
