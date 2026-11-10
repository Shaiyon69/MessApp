-- Chimaera desktop's library, synced by its Friends tab so Messapp can show it
-- (link plan milestone 4). Readable by the owner and the owner's accepted friends,
-- never by strangers (user, 2026-11-09). Only the owner writes.
-- shortcut: no per-user row cap; add a trigger cap if a client ever floods it.
create table if not exists public.chimaera_library (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  shop text not null check (char_length(shop) between 1 and 32),
  object_id text not null check (char_length(object_id) between 1 and 200),
  title text not null check (char_length(title) between 1 and 200),
  icon_url text check (icon_url is null or (char_length(icon_url) <= 1000 and icon_url like 'https://%')),
  playtime_ms bigint not null default 0 check (playtime_ms >= 0),
  last_played_at timestamptz,
  achievements_unlocked integer check (achievements_unlocked is null or achievements_unlocked >= 0),
  achievements_total integer check (achievements_total is null or achievements_total >= 0),
  updated_at timestamptz not null default now(),
  -- Leads with profile_id, so it also indexes the foreign key.
  primary key (profile_id, shop, object_id)
);

alter table public.chimaera_library enable row level security;

drop policy if exists "chimaera_library_select_owner_or_friend" on public.chimaera_library;
create policy "chimaera_library_select_owner_or_friend"
on public.chimaera_library
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.sender_id = (select auth.uid()) and f.receiver_id = chimaera_library.profile_id)
        or (f.receiver_id = (select auth.uid()) and f.sender_id = chimaera_library.profile_id)
      )
  )
);

drop policy if exists "chimaera_library_insert_self" on public.chimaera_library;
create policy "chimaera_library_insert_self"
on public.chimaera_library
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "chimaera_library_update_self" on public.chimaera_library;
create policy "chimaera_library_update_self"
on public.chimaera_library
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "chimaera_library_delete_self" on public.chimaera_library;
create policy "chimaera_library_delete_self"
on public.chimaera_library
for delete
to authenticated
using (profile_id = (select auth.uid()));

-- EXECUTE on handle_updated_at is revoked from clients; a trigger still fires,
-- since that privilege is checked only when the trigger is created.
drop trigger if exists chimaera_library_updated_at on public.chimaera_library;
create trigger chimaera_library_updated_at
before update on public.chimaera_library
for each row execute function public.handle_updated_at();

revoke all on table public.chimaera_library from anon, public;
grant select, insert, update, delete on table public.chimaera_library to authenticated;
