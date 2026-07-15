\set ON_ERROR_STOP on

begin;
set local session_replication_role = replica;

insert into public.profiles (id, username, terms_version, terms_accepted_at)
values
  ('00000000-0000-0000-0000-00000000000a', 'audit-a', '2026-07-12', now()),
  ('00000000-0000-0000-0000-00000000000b', 'audit-b', '2026-07-12', now()),
  ('00000000-0000-0000-0000-00000000000c', 'audit-c', '2026-07-12', now());

insert into public.dm_rooms (id) values
  ('10000000-0000-0000-0000-0000000000ab'),
  ('10000000-0000-0000-0000-0000000000ac');

insert into public.dm_members (dm_room_id, profile_id) values
  ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-00000000000c');

insert into public.messages (id, dm_room_id, profile_id, content, is_encrypted) values
  ('20000000-0000-0000-0000-0000000000ab', '10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'fixture-ab', true),
  ('20000000-0000-0000-0000-0000000000ac', '10000000-0000-0000-0000-0000000000ac', '00000000-0000-0000-0000-00000000000a', 'fixture-ac', true);

set local session_replication_role = origin;

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do update set public = false;

insert into storage.objects (id, bucket_id, name, owner_id) values
  ('30000000-0000-0000-0000-0000000000ab', 'chat-attachments', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000ab/a.json', '00000000-0000-0000-0000-00000000000a'),
  ('30000000-0000-0000-0000-0000000000ac', 'chat-attachments', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-0000000000ac/a.json', '00000000-0000-0000-0000-00000000000a');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.messages;
  if visible_count <> 1 then
    raise exception 'B expected 1 visible message, got %', visible_count;
  end if;

  if exists (
    select 1 from public.messages
    where dm_room_id = '10000000-0000-0000-0000-0000000000ac'
  ) then
    raise exception 'B can read the A-C conversation';
  end if;

  select count(*) into visible_count
  from storage.objects
  where bucket_id = 'chat-attachments';
  if visible_count <> 1 then
    raise exception 'B expected 1 visible attachment, got %', visible_count;
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    insert into public.messages (dm_room_id, profile_id, content, is_encrypted)
    values ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000c', 'must-fail', true);
    raise exception 'C inserted a message into the A-B conversation';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.dm_members (dm_room_id, profile_id)
    values ('10000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000c');
    raise exception 'C joined the A-B conversation directly';
  exception
    when insufficient_privilege then null;
  end;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'chat-attachments'
      and name like '%/10000000-0000-0000-0000-0000000000ab/%'
  ) then
    raise exception 'C can read an A-B attachment';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'chat-attachments',
      '00000000-0000-0000-0000-00000000000c/10000000-0000-0000-0000-0000000000ab/c.json',
      '00000000-0000-0000-0000-00000000000c'
    );
    raise exception 'C uploaded an attachment into the A-B conversation';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

rollback;
