-- Which app a message was sent from. Chimaera shows only 'chimaera' messages;
-- MESSAPP shows both and can filter. Existing rows stay 'messapp'.
alter table public.messages
  add column if not exists origin text not null default 'messapp';

alter table public.messages
  drop constraint if exists messages_origin_check;
alter table public.messages
  add constraint messages_origin_check check (origin in ('messapp', 'chimaera'));

create index if not exists messages_dm_room_origin_created_idx
  on public.messages (dm_room_id, origin, created_at desc);

-- The origin is part of what a message is, so it cannot change after insert.
create or replace function public.messages_origin_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.origin is distinct from old.origin then
    raise exception 'messages.origin is immutable';
  end if;
  return new;
end;
$$;

revoke execute on function public.messages_origin_immutable() from public, anon, authenticated;

drop trigger if exists messages_origin_immutable on public.messages;
create trigger messages_origin_immutable
  before update of origin on public.messages
  for each row execute function public.messages_origin_immutable();
