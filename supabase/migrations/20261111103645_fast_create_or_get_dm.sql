-- create_or_get_dm scanned every dm_rooms row (EXISTS per room, about 170 ms and
-- 1000 buffer reads with few rooms) and took an advisory lock even when the room
-- already existed. The lookup now starts from the caller's own memberships
-- (dm_members_profile_id_idx, then the (dm_room_id, profile_id) key) and runs
-- before the lock; the lock and a second lookup only guard the insert.
-- Same signature, checks and result, so grants and both clients are unchanged.

create or replace function public.create_or_get_dm(peer_id uuid)
returns public.dm_rooms
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  actor uuid := auth.uid();
  room public.dm_rooms;
  lock_key text;
  member_count integer := case when peer_id = actor then 1 else 2 end;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if peer_id is null or not exists(select 1 from public.profiles where id = peer_id) then raise exception 'user not found'; end if;
  if peer_id <> actor and public.users_blocked(actor, peer_id) then raise exception 'direct messages are blocked'; end if;
  if peer_id <> actor and not coalesce((select allow_dms from public.profiles where id = peer_id), true) then raise exception 'user is not accepting direct messages'; end if;

  select r.* into room
  from public.dm_members mine
  join public.dm_members theirs on theirs.dm_room_id = mine.dm_room_id and theirs.profile_id = peer_id
  join public.dm_rooms r on r.id = mine.dm_room_id
  where mine.profile_id = actor
    and (select count(distinct m.profile_id) from public.dm_members m where m.dm_room_id = r.id) = member_count
  order by r.created_at asc
  limit 1;
  if room.id is not null then return room; end if;

  -- Two first messages at once: serialise the pair, then look again before creating.
  lock_key := least(actor::text, peer_id::text) || ':' || greatest(actor::text, peer_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select r.* into room
  from public.dm_members mine
  join public.dm_members theirs on theirs.dm_room_id = mine.dm_room_id and theirs.profile_id = peer_id
  join public.dm_rooms r on r.id = mine.dm_room_id
  where mine.profile_id = actor
    and (select count(distinct m.profile_id) from public.dm_members m where m.dm_room_id = r.id) = member_count
  order by r.created_at asc
  limit 1;
  if room.id is not null then return room; end if;

  insert into public.dm_rooms default values returning * into room;
  insert into public.dm_members(dm_room_id, profile_id) values (room.id, actor);
  if peer_id <> actor then insert into public.dm_members(dm_room_id, profile_id) values (room.id, peer_id); end if;
  return room;
end
$function$;
