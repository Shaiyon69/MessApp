\set ON_ERROR_STOP on

begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);
set local session_replication_role = replica;

insert into public.profiles (
  id,
  username,
  unique_tag,
  encrypted_private_key,
  allow_friend_requests
) values
  ('00000000-0000-0000-0000-00000000000a', 'privacy-a', 'privacy-a#0001', 'encrypted-a-private-key-backup-value', true),
  ('00000000-0000-0000-0000-00000000000b', 'privacy-b', 'privacy-b#0002', 'encrypted-b-private-key-backup-value', true),
  ('00000000-0000-0000-0000-00000000000c', 'privacy-c', 'privacy-c#0003', 'encrypted-c-private-key-backup-value', true);

insert into public.friendships (id, sender_id, receiver_id, status)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000a',
  '00000000-0000-0000-0000-00000000000b',
  'pending'
);

set local session_replication_role = origin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  updated_rows integer;
begin
  if exists (
    select 1 from public.profiles
    where id = '00000000-0000-0000-0000-00000000000c'
  ) then
    raise exception 'unrelated profile was visible';
  end if;

  begin
    perform encrypted_private_key
    from public.profiles
    where id = auth.uid();
    raise exception using errcode = 'ZX001', message = 'sensitive profile column was directly readable';
  exception when insufficient_privilege then null;
  end;

  if not exists (
    select 1
    from public.get_my_profile_secrets()
    where encrypted_private_key is not null
  ) then
    raise exception 'self-only secret function returned no key';
  end if;

  if not exists (
    select 1
    from public.search_profiles_for_friend('privacy-c#0003')
    where id = '00000000-0000-0000-0000-00000000000c'
  ) then
    raise exception 'exact friend search did not return a discoverable profile';
  end if;

  update public.friendships
  set status = 'accepted'
  where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics updated_rows = row_count;
  if updated_rows <> 0 then
    raise exception 'friend request sender accepted their own request';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

update public.friendships
set status = 'accepted'
where id = '10000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.friendships
    where id = '10000000-0000-0000-0000-000000000001'
      and status = 'accepted'
  ) then
    raise exception 'friend request receiver could not accept request';
  end if;
end $$;

reset role;
select extensions.pass('profile privacy and friendship RLS assertions passed');
select * from extensions.finish();
rollback;
