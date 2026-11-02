-- Private channels and per-channel themes.
--
-- A private channel is visible to the server's owner and admins plus the
-- people listed in channel_access. Visibility is enforced in one place,
-- is_channel_member(), which message reads and writes, reactions, read
-- pointers and attachments already go through, and in the channels SELECT
-- policy so a private channel's row (name included) stays hidden too.
--
-- A channel's theme_id overrides the server's theme; null follows the server.

alter table public.channels add column if not exists is_private boolean not null default false;
alter table public.channels add column if not exists theme_id text;

alter table public.channels drop constraint if exists channels_theme_id_check;
alter table public.channels add constraint channels_theme_id_check
  check (theme_id is null or theme_id in ('mono', 'ocean', 'forest', 'sunset', 'lavender', 'amber'));

create table if not exists public.channel_access (
  channel_id uuid not null references public.channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);
create index if not exists channel_access_profile_id_idx on public.channel_access (profile_id);
create index if not exists channel_access_added_by_idx on public.channel_access (added_by);
alter table public.channel_access enable row level security;

-- Whether a given person can see a channel. Not tied to auth.uid(), so the
-- notification trigger can ask it about a recipient. Not callable by clients:
-- it would let anyone probe who has access where.
create or replace function public.can_view_channel(target_channel_id uuid, target_profile_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    join public.server_members sm on sm.server_id = cat.server_id and sm.profile_id = target_profile_id
    where ch.id = target_channel_id
      and (
        not ch.is_private
        or sm.role in ('owner', 'admin')
        or exists (
          select 1 from public.channel_access ca
          where ca.channel_id = ch.id and ca.profile_id = target_profile_id
        )
      )
  )
$$;

create or replace function public.is_channel_member(target_channel_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null
    and (target_profile_id is null or target_profile_id = auth.uid())
    and public.can_view_channel(target_channel_id, auth.uid())
$$;

drop policy if exists channels_read_member on public.channels;
create policy channels_read_member on public.channels
  for select to authenticated
  using (public.is_channel_member(id));

-- Access rows: managers of the channel's server add and remove them; anyone
-- sees their own rows, and managers see all of the server's.
create or replace function public.can_manage_channel(target_channel_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.channels ch
    join public.categories cat on cat.id = ch.category_id
    where ch.id = target_channel_id and public.can_manage_server(cat.server_id)
  )
$$;

drop policy if exists channel_access_read on public.channel_access;
create policy channel_access_read on public.channel_access
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.can_manage_channel(channel_id));

drop policy if exists channel_access_insert_manager on public.channel_access;
create policy channel_access_insert_manager on public.channel_access
  for insert to authenticated
  with check (
    public.can_manage_channel(channel_id)
    and added_by = (select auth.uid())
    and exists (
      select 1 from public.channels ch
      join public.categories cat on cat.id = ch.category_id
      join public.server_members sm on sm.server_id = cat.server_id
      where ch.id = channel_access.channel_id and sm.profile_id = channel_access.profile_id
    )
  );

drop policy if exists channel_access_delete_manager on public.channel_access;
create policy channel_access_delete_manager on public.channel_access
  for delete to authenticated
  using (public.can_manage_channel(channel_id));

-- Notification triggers write rows for people who may not see a private
-- channel (a mention, a reply). Drop those before they land.
create or replace function public.drop_hidden_channel_notification()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.channel_id is not null and not public.can_view_channel(new.channel_id, new.recipient_id) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists notifications_channel_visibility on public.notifications;
create trigger notifications_channel_visibility
  before insert on public.notifications
  for each row execute function public.drop_hidden_channel_notification();

revoke all on function public.can_view_channel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.drop_hidden_channel_notification() from public, anon, authenticated;
revoke all on function public.can_manage_channel(uuid) from public, anon;
grant execute on function public.can_manage_channel(uuid) to authenticated;
revoke all on function public.is_channel_member(uuid, uuid) from public, anon;
grant execute on function public.is_channel_member(uuid, uuid) to authenticated;
grant select, insert, delete on public.channel_access to authenticated;
