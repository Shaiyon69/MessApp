\set ON_ERROR_STOP on

-- Roles and permission overwrites (20261103160000_server_roles.sql).
-- Owner o, member m (holds role R), member n (no roles).
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);
set local session_replication_role = replica;

insert into public.profiles (id, username, unique_tag, encrypted_private_key, allow_friend_requests) values
  ('00000000-0000-0000-0000-0000000000a1', 'perm-owner', 'perm-owner#0001', 'encrypted-owner-private-key-backup', true),
  ('00000000-0000-0000-0000-0000000000a2', 'perm-member', 'perm-member#0002', 'encrypted-member-private-key-backup', true),
  ('00000000-0000-0000-0000-0000000000a3', 'perm-other', 'perm-other#0003', 'encrypted-other-private-key-backup', true);

insert into public.servers (id, name, owner_id) values
  ('20000000-0000-0000-0000-000000000001', 'perm server', '00000000-0000-0000-0000-0000000000a1');

insert into public.server_members (server_id, profile_id, role) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'member'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'member');

-- c1 private (everyone deny, role R allow); c2 public.
insert into public.categories (id, server_id, name, position) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'staff', 0),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'general', 1);

-- ch1 synced in c1; ch2 unsynced in c1 and public on its own;
-- ch3 unsynced in c2 with a member deny for m over a role allow.
insert into public.channels (id, category_id, name, type, position, sync_permissions) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'synced', 'text', 0, true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'own-rules', 'text', 1, false),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', 'denied', 'text', 0, false);

insert into public.server_roles (id, server_id, name) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'R');
insert into public.server_member_roles (role_id, profile_id, server_id) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-000000000001');

insert into public.permission_overwrites (server_id, category_id, channel_id, target, role_id, profile_id, allow, deny) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, 'everyone', null, null, 0, 1),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, 'role', '50000000-0000-0000-0000-000000000001', null, 1, 0),
  ('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000003', 'role', '50000000-0000-0000-0000-000000000001', null, 1, 0),
  ('20000000-0000-0000-0000-000000000001', null, '40000000-0000-0000-0000-000000000003', 'member', null, '00000000-0000-0000-0000-0000000000a2', 0, 1);

set local session_replication_role = origin;

do $$
begin
  -- Role allow beats @everyone deny; the synced channel follows its category.
  if not public.can_view_channel('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'role holder could not see the synced private channel';
  end if;
  if public.can_view_channel('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3') then
    raise exception 'member without the role saw the synced private channel';
  end if;
  -- An unsynced channel ignores its category's overwrites.
  if not public.can_view_channel('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3') then
    raise exception 'unsynced public channel was hidden by its category';
  end if;
  -- A member deny beats a role allow.
  if public.can_view_channel('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'member deny did not override the role allow';
  end if;
  -- Owners see everything.
  if not public.can_view_channel('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'owner could not see a denied channel';
  end if;
end $$;

-- Member n: the private category still shows because ch2 inside it is visible.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.categories where id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'category with a visible channel was hidden';
  end if;
  if exists (select 1 from public.channels where id = '40000000-0000-0000-0000-000000000001') then
    raise exception 'hidden channel row was readable';
  end if;
end $$;
reset role;

-- Owner: insert ... returning works (the bug fixed by channels_read_manager),
-- and new channels default to synced.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare synced boolean;
begin
  insert into public.channels (category_id, name, type, position)
  values ('30000000-0000-0000-0000-000000000001', 'fresh', 'text', 5)
  returning sync_permissions into synced;
  if not synced then raise exception 'new channel was not synced by default'; end if;
end $$;
reset role;

select extensions.pass('role and overwrite permission assertions passed');
select * from extensions.finish();
rollback;
