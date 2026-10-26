\set ON_ERROR_STOP on

begin;
set local session_replication_role = replica;

insert into public.profiles (id, username) values
  ('50000000-0000-0000-0000-00000000000a', 'push-a'),
  ('50000000-0000-0000-0000-00000000000b', 'push-b');

insert into public.dm_rooms (id)
values ('51000000-0000-0000-0000-000000000001');

insert into public.dm_members (dm_room_id, profile_id) values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-00000000000b');

insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-00000000000a',
  'push fixture',
  true
);

insert into public.push_devices (
  profile_id,
  installation_id,
  platform,
  push_token
) values (
  '50000000-0000-0000-0000-00000000000b',
  'installation-b-0001',
  'android',
  'push-token-b'
);

set local session_replication_role = origin;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.push_devices (
  profile_id,
  installation_id,
  platform,
  push_token
) values (
  '50000000-0000-0000-0000-00000000000a',
  'installation-a-0001',
  'android',
  'push-token-a'
);

select public.register_push_device(
  'installation-a-0001',
  'android',
  'push-token-b'
);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.push_devices;
  if visible_count <> 1 then
    raise exception 'push_devices RLS exposed % rows instead of one', visible_count;
  end if;

  begin
    insert into public.push_devices (
      profile_id,
      installation_id,
      platform,
      push_token
    ) values (
      '50000000-0000-0000-0000-00000000000b',
      'installation-spoof',
      'android',
      'push-token-spoof'
    );
    raise exception using errcode = 'ZX001', message = 'push device spoofing was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform count(*) from public.push_delivery_events;
    raise exception using errcode = 'ZX001', message = 'authenticated delivery-event read was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.claim_push_delivery_event(
      'client-claim',
      '52000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-00000000000b',
      'installation-b-0001'
    );
    raise exception using errcode = 'ZX001', message = 'authenticated delivery claim was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role anon;

do $$
begin
  begin
    perform count(*) from public.messages;
    raise exception using errcode = 'ZX001', message = 'anonymous message read was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted)
    values (
      '51000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-00000000000a',
      'anonymous message',
      true
    );
    raise exception using errcode = 'ZX001', message = 'anonymous message insert was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set local role service_role;

do $$
declare
  claimed boolean;
  attempt_count integer;
  active_token_owner uuid;
begin
  select profile_id into active_token_owner
  from public.push_devices
  where push_token = 'push-token-b' and enabled;
  if active_token_owner <> '50000000-0000-0000-0000-00000000000a'::uuid then
    raise exception 'push token was not atomically transferred to the registering account';
  end if;

  claimed := public.claim_push_delivery_event(
    'service-claim',
    '52000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-00000000000b',
    'installation-b-0001'
  );
  if not claimed then
    raise exception 'service role could not claim a new delivery';
  end if;

  claimed := public.claim_push_delivery_event(
    'service-claim',
    '52000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-00000000000b',
    'installation-b-0001'
  );
  if claimed then
    raise exception 'active delivery lease was claimed twice';
  end if;

  update public.push_delivery_events
  set status = 'failed', last_error_code = 'TEMPORARY'
  where event_key = 'service-claim';

  claimed := public.claim_push_delivery_event(
    'service-claim',
    '52000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-00000000000b',
    'installation-b-0001'
  );
  if not claimed then
    raise exception 'failed delivery could not be reclaimed';
  end if;

  select attempts into attempt_count
  from public.push_delivery_events
  where event_key = 'service-claim';
  if attempt_count <> 2 then
    raise exception 'reclaimed delivery expected two attempts, got %', attempt_count;
  end if;
end $$;

reset role;
rollback;
