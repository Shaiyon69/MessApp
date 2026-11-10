\set ON_ERROR_STOP on

begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(1);
set local session_replication_role = replica;

-- a and b are friends; d only has a pending request to a; c is a stranger.
insert into public.profiles (id, username, unique_tag) values
  ('00000000-0000-0000-0000-0000000001a0', 'library-a', 'library-a#0001'),
  ('00000000-0000-0000-0000-0000000001b0', 'library-b', 'library-b#0002'),
  ('00000000-0000-0000-0000-0000000001c0', 'library-c', 'library-c#0003'),
  ('00000000-0000-0000-0000-0000000001d0', 'library-d', 'library-d#0004');

insert into public.friendships (id, sender_id, receiver_id, status) values
  ('10000000-0000-0000-0000-0000000001ab', '00000000-0000-0000-0000-0000000001a0', '00000000-0000-0000-0000-0000000001b0', 'accepted'),
  ('10000000-0000-0000-0000-0000000001ad', '00000000-0000-0000-0000-0000000001d0', '00000000-0000-0000-0000-0000000001a0', 'pending');

set local session_replication_role = origin;

-- a writes their own row.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a0","role":"authenticated"}', true);
set local role authenticated;

insert into public.chimaera_library (profile_id, shop, object_id, title, playtime_ms)
values ('00000000-0000-0000-0000-0000000001a0', 'steam', '620', 'Portal 2', 3600000);

do $$
begin
  if (select count(*) from public.chimaera_library) <> 1 then
    raise exception 'owner could not read their own row';
  end if;
  update public.chimaera_library set playtime_ms = 7200000 where object_id = '620';
  if (select updated_at > '2000-01-01' from public.chimaera_library where object_id = '620') is not true then
    raise exception 'updated_at not set';
  end if;
end $$;

-- b, a friend, reads but cannot change it.
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001b0","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  changed integer;
begin
  if (select count(*) from public.chimaera_library where profile_id = '00000000-0000-0000-0000-0000000001a0') <> 1 then
    raise exception 'accepted friend could not read the library';
  end if;
  update public.chimaera_library set playtime_ms = 0 where profile_id = '00000000-0000-0000-0000-0000000001a0';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'friend updated someone else''s library';
  end if;
  delete from public.chimaera_library where profile_id = '00000000-0000-0000-0000-0000000001a0';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'friend deleted someone else''s library';
  end if;
end $$;

-- c, a stranger, sees nothing and cannot write for a.
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001c0","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.chimaera_library) then
    raise exception 'stranger could read a library';
  end if;
  begin
    insert into public.chimaera_library (profile_id, shop, object_id, title)
    values ('00000000-0000-0000-0000-0000000001a0', 'steam', '400', 'Portal');
    raise exception 'stranger inserted into someone else''s library';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- d, with only a pending request, sees nothing.
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001d0","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.chimaera_library) then
    raise exception 'pending friend could read a library';
  end if;
end $$;

-- anon has no access at all.
reset role;
set local role anon;

do $$
begin
  perform 1 from public.chimaera_library;
  raise exception 'anon could select from chimaera_library';
exception when insufficient_privilege then
  null;
end $$;

reset role;
select extensions.pass('chimaera_library RLS assertions passed');
select * from extensions.finish();
rollback;
