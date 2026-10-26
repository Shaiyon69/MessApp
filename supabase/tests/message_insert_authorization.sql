\set ON_ERROR_STOP on

begin;
set local session_replication_role = replica;

-- Consent fields intentionally remain null: message authorization must not
-- fabricate or infer legal acceptance.
insert into public.profiles (id, username, allow_dms) values
  ('00000000-0000-0000-0000-00000000000a', 'message-a', true),
  ('00000000-0000-0000-0000-00000000000b', 'message-b', true),
  ('00000000-0000-0000-0000-00000000000c', 'message-c', true),
  ('00000000-0000-0000-0000-00000000000d', 'message-d', true);

do $$
begin
  if exists (
    select 1
    from public.profiles
    where id in (
      '00000000-0000-0000-0000-00000000000a',
      '00000000-0000-0000-0000-00000000000b',
      '00000000-0000-0000-0000-00000000000c',
      '00000000-0000-0000-0000-00000000000d'
    )
      and (terms_version is not null or terms_accepted_at is not null)
  ) then
    raise exception 'message authorization fixture fabricated consent';
  end if;
end $$;

insert into public.dm_rooms (id) values
  ('10000000-0000-0000-0000-0000000000ab'),
  ('10000000-0000-0000-0000-0000000000bc'),
  ('10000000-0000-0000-0000-0000000000ad');

insert into public.dm_members (dm_room_id, profile_id) values
  ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-0000000000bc', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-0000000000bc', '00000000-0000-0000-0000-00000000000c'),
  ('10000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-00000000000d');

insert into public.user_relationships (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000a');

insert into public.servers (id, name, owner_id) values
  ('30000000-0000-0000-0000-000000000001', 'Message server one', '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-000000000002', 'Message server two', '00000000-0000-0000-0000-00000000000b');

insert into public.categories (id, server_id, name) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'General'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'General');

insert into public.channels (id, category_id, name, type) values
  ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'messages', 'text'),
  ('32000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'messages', 'text');

insert into public.server_members (server_id, profile_id, role) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted) values
  ('20000000-0000-0000-0000-0000000000ab', '10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000b', 'same conversation fixture', true),
  ('20000000-0000-0000-0000-0000000000bc', '10000000-0000-0000-0000-0000000000bc', '00000000-0000-0000-0000-00000000000b', 'other conversation fixture', true);

set local session_replication_role = origin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

-- Allowed: DM, channel, same-conversation reply, and attachment-backed message.
insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'allowed dm', true);

insert into public.messages (id, channel_id, profile_id, content, is_encrypted) values
  ('40000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'allowed channel', true);

insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted, reply_to_message_id) values
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'allowed reply', true, '20000000-0000-0000-0000-0000000000ab');

insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted) values
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', '[attachment]', true);

insert into public.message_attachments (message_id, file_url, file_type, file_name, file_size) values
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000ab/test.png', 'image/png', 'test.png', 128);

do $$
begin
  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted)
    values ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000b', 'spoofed sender', true);
    raise exception using errcode = 'ZX001', message = 'sender spoofing was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted)
    values ('10000000-0000-0000-0000-0000000000bc', '00000000-0000-0000-0000-00000000000a', 'foreign dm', true);
    raise exception using errcode = 'ZX001', message = 'non-member DM insert was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (channel_id, profile_id, content, is_encrypted)
    values ('32000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'foreign channel', true);
    raise exception using errcode = 'ZX001', message = 'non-member channel insert was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted)
    values ('10000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-00000000000a', 'blocked dm', true);
    raise exception using errcode = 'ZX001', message = 'blocked DM insert was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (dm_room_id, channel_id, profile_id, content, is_encrypted)
    values ('10000000-0000-0000-0000-0000000000ab', '32000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'two targets', true);
    raise exception using errcode = 'ZX001', message = 'simultaneous DM and channel targets were accepted';
  exception when check_violation then null;
  end;

  begin
    insert into public.messages (profile_id, content, is_encrypted)
    values ('00000000-0000-0000-0000-00000000000a', 'no target', true);
    raise exception using errcode = 'ZX001', message = 'message without a target was accepted';
  exception when insufficient_privilege or check_violation then null;
  end;

  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted, reply_to_message_id)
    values ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'cross-conversation reply', true, '20000000-0000-0000-0000-0000000000bc');
    raise exception using errcode = 'ZX001', message = 'cross-conversation reply was accepted';
  exception when raise_exception then null;
  end;
end $$;

reset role;
rollback;
