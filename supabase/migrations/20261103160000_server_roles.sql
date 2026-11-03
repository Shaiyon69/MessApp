-- Roles and per-role permission overwrites for categories and channels.
--
-- Model (Discord's, cut to one bit for now): a server has roles, members hold
-- roles, and a category or channel carries overwrites for @everyone, a role or
-- one member. Each overwrite has allow/deny bitmasks; only VIEW_CHANNEL (1) is
-- enforced today. Owners and admins always see everything.
--
-- A channel with sync_permissions = true uses its category's overwrites, read
-- live, so changing a category reaches every synced channel with no copying.
--
-- can_view_channel keeps its signature, so is_channel_member and everything
-- built on it (messages, reactions, read pointers, voice/room realtime topics,
-- the notification visibility trigger) follow the new rules unchanged.
--
-- Deprecated, kept for v1.3.0 clients: channels.is_private and channel_access.
-- Their rows are converted below and no longer decide visibility. Drop both once
-- v1.4.0 has shipped.

-- Roles -----------------------------------------------------------------------

create table if not exists public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists server_roles_server_id_idx on public.server_roles (server_id, position);
alter table public.server_roles enable row level security;

-- server_id is copied from the role by a trigger so Realtime can filter on it.
create table if not exists public.server_member_roles (
  role_id uuid not null references public.server_roles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, profile_id)
);
create index if not exists server_member_roles_profile_id_idx on public.server_member_roles (profile_id);
create index if not exists server_member_roles_server_id_idx on public.server_member_roles (server_id);
alter table public.server_member_roles enable row level security;

-- Overwrites ------------------------------------------------------------------

create table if not exists public.permission_overwrites (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  target text not null check (target in ('everyone', 'role', 'member')),
  role_id uuid references public.server_roles(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  allow integer not null default 0,
  deny integer not null default 0,
  created_at timestamptz not null default now(),
  constraint permission_overwrites_one_container check ((category_id is null) <> (channel_id is null)),
  constraint permission_overwrites_target_shape check (
    (target = 'everyone' and role_id is null and profile_id is null)
    or (target = 'role' and role_id is not null and profile_id is null)
    or (target = 'member' and profile_id is not null and role_id is null)
  ),
  constraint permission_overwrites_unique unique nulls not distinct (category_id, channel_id, target, role_id, profile_id)
);
create index if not exists permission_overwrites_server_id_idx on public.permission_overwrites (server_id);
create index if not exists permission_overwrites_category_id_idx on public.permission_overwrites (category_id);
create index if not exists permission_overwrites_channel_id_idx on public.permission_overwrites (channel_id);
create index if not exists permission_overwrites_role_id_idx on public.permission_overwrites (role_id);
create index if not exists permission_overwrites_profile_id_idx on public.permission_overwrites (profile_id);
alter table public.permission_overwrites enable row level security;

-- Existing channels keep their own rules; new ones follow their category.
alter table public.channels add column if not exists sync_permissions boolean not null default false;
alter table public.channels alter column sync_permissions set default true;

-- Channel topic, shown in the chat header (channel settings > Overview).
alter table public.channels add column if not exists topic text;
alter table public.channels drop constraint if exists channels_topic_length;
alter table public.channels add constraint channels_topic_length check (topic is null or char_length(topic) <= 1024);

-- Server ids come from the parent rows, never from the client, so a manager of
-- one server cannot file rows under another.
create or replace function public.fill_member_role_server()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  select server_id into new.server_id from public.server_roles where id = new.role_id;
  if new.server_id is null then raise exception 'role not found'; end if;
  if not exists (select 1 from public.server_members where server_id = new.server_id and profile_id = new.profile_id) then
    raise exception 'not a member of this server';
  end if;
  return new;
end $$;

drop trigger if exists server_member_roles_fill_server on public.server_member_roles;
create trigger server_member_roles_fill_server
  before insert or update on public.server_member_roles
  for each row execute function public.fill_member_role_server();

create or replace function public.fill_overwrite_server()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.category_id is not null then
    select server_id into new.server_id from public.categories where id = new.category_id;
  else
    select cat.server_id into new.server_id
    from public.channels ch join public.categories cat on cat.id = ch.category_id
    where ch.id = new.channel_id;
  end if;
  if new.server_id is null then raise exception 'category or channel not found'; end if;
  if new.role_id is not null and not exists (select 1 from public.server_roles where id = new.role_id and server_id = new.server_id) then
    raise exception 'role belongs to another server';
  end if;
  if new.profile_id is not null and not exists (select 1 from public.server_members where server_id = new.server_id and profile_id = new.profile_id) then
    raise exception 'not a member of this server';
  end if;
  return new;
end $$;

drop trigger if exists permission_overwrites_fill_server on public.permission_overwrites;
create trigger permission_overwrites_fill_server
  before insert or update on public.permission_overwrites
  for each row execute function public.fill_overwrite_server();

-- A member who leaves loses their roles and member overwrites, so rejoining
-- starts clean.
create or replace function public.drop_departed_member_permissions()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.server_member_roles where server_id = old.server_id and profile_id = old.profile_id;
  delete from public.permission_overwrites where server_id = old.server_id and profile_id = old.profile_id;
  return old;
end $$;

drop trigger if exists server_members_drop_permissions on public.server_members;
create trigger server_members_drop_permissions
  after delete on public.server_members
  for each row execute function public.drop_departed_member_permissions();

-- Resolution ------------------------------------------------------------------

-- Whether the overwrites on one container let a person view it. Container is
-- the channel when target_channel_id is given, else the category. Discord
-- order: @everyone, then the member's roles together (an allow on any role
-- beats a deny on another), then the member's own overwrite.
create or replace function public.overwrites_allow_view(target_category_id uuid, target_channel_id uuid, target_profile_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with o as (
    select po.target, po.role_id, po.profile_id, po.allow & 1 <> 0 as a, po.deny & 1 <> 0 as d
    from public.permission_overwrites po
    where case when target_channel_id is not null
      then po.channel_id = target_channel_id
      else po.category_id = target_category_id end
  ),
  everyone as (select coalesce(bool_or(a), false) a, coalesce(bool_or(d), false) d from o where target = 'everyone'),
  roles as (
    select coalesce(bool_or(o.a), false) a, coalesce(bool_or(o.d), false) d
    from o join public.server_member_roles mr on mr.role_id = o.role_id and mr.profile_id = target_profile_id
    where o.target = 'role'
  ),
  self as (select coalesce(bool_or(a), false) a, coalesce(bool_or(d), false) d from o where target = 'member' and profile_id = target_profile_id)
  select case
    when self.a then true when self.d then false
    when roles.a then true when roles.d then false
    when everyone.a then true when everyone.d then false
    else true
  end
  from everyone, roles, self
$$;

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
        sm.role in ('owner', 'admin')
        or public.overwrites_allow_view(cat.id, case when ch.sync_permissions then null else ch.id end, target_profile_id)
      )
  )
$$;

-- A category shows when its own overwrites allow it or any channel in it is
-- visible, like Discord.
create or replace function public.can_view_category(target_category_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.categories cat
    join public.server_members sm on sm.server_id = cat.server_id and sm.profile_id = auth.uid()
    where cat.id = target_category_id
      and (
        sm.role in ('owner', 'admin')
        or public.overwrites_allow_view(cat.id, null, auth.uid())
        or exists (select 1 from public.channels ch where ch.category_id = cat.id and public.can_view_channel(ch.id, auth.uid()))
      )
  )
$$;

-- Policies --------------------------------------------------------------------

drop policy if exists categories_read_member on public.categories;
create policy categories_read_member on public.categories
  for select to authenticated
  using (public.can_view_category(id));

-- Managers read channels through their category, not through a lookup of the
-- channel row itself: an insert ... returning checks this in the insert's own
-- snapshot, where is_channel_member cannot see the new row yet (the reason
-- channel creation failed after 20261103130000).
drop policy if exists channels_read_manager on public.channels;
create policy channels_read_manager on public.channels
  for select to authenticated
  using (exists (
    select 1 from public.categories c
    where c.id = channels.category_id and public.can_manage_server(c.server_id)
  ));

drop policy if exists server_roles_read_member on public.server_roles;
create policy server_roles_read_member on public.server_roles
  for select to authenticated using (public.is_server_member(server_id));
drop policy if exists server_roles_manage on public.server_roles;
create policy server_roles_manage on public.server_roles
  for all to authenticated
  using (public.can_manage_server(server_id)) with check (public.can_manage_server(server_id));

drop policy if exists server_member_roles_read_member on public.server_member_roles;
create policy server_member_roles_read_member on public.server_member_roles
  for select to authenticated using (public.is_server_member(server_id));
drop policy if exists server_member_roles_manage on public.server_member_roles;
create policy server_member_roles_manage on public.server_member_roles
  for all to authenticated
  using (public.can_manage_server(server_id)) with check (public.can_manage_server(server_id));

drop policy if exists permission_overwrites_read_member on public.permission_overwrites;
create policy permission_overwrites_read_member on public.permission_overwrites
  for select to authenticated using (public.is_server_member(server_id));
drop policy if exists permission_overwrites_manage on public.permission_overwrites;
create policy permission_overwrites_manage on public.permission_overwrites
  for all to authenticated
  using (public.can_manage_server(server_id)) with check (public.can_manage_server(server_id));

-- Convert the member-list private channels --------------------------------------

insert into public.permission_overwrites (server_id, channel_id, target, deny)
select cat.server_id, ch.id, 'everyone', 1
from public.channels ch join public.categories cat on cat.id = ch.category_id
where ch.is_private
on conflict on constraint permission_overwrites_unique do nothing;

insert into public.permission_overwrites (server_id, channel_id, target, profile_id, allow)
select cat.server_id, ca.channel_id, 'member', ca.profile_id, 1
from public.channel_access ca
join public.channels ch on ch.id = ca.channel_id
join public.categories cat on cat.id = ch.category_id
where ch.is_private
  and exists (select 1 from public.server_members sm where sm.server_id = cat.server_id and sm.profile_id = ca.profile_id)
on conflict on constraint permission_overwrites_unique do nothing;

comment on column public.channels.is_private is 'Deprecated by permission_overwrites (20261103160000). Drop after v1.4.0 ships.';
comment on table public.channel_access is 'Deprecated by permission_overwrites (20261103160000). Drop after v1.4.0 ships.';

-- Realtime --------------------------------------------------------------------

-- Broadcast, not the publication: see 20261103155000_broadcast_realtime.sql.
drop trigger if exists broadcast_server_layout_change on public.server_roles;
create trigger broadcast_server_layout_change
  after insert or update or delete on public.server_roles
  for each row execute function public.broadcast_server_layout_change();

drop trigger if exists broadcast_server_layout_change on public.server_member_roles;
create trigger broadcast_server_layout_change
  after insert or update or delete on public.server_member_roles
  for each row execute function public.broadcast_server_layout_change();

drop trigger if exists broadcast_server_layout_change on public.permission_overwrites;
create trigger broadcast_server_layout_change
  after insert or update or delete on public.permission_overwrites
  for each row execute function public.broadcast_server_layout_change();

-- Grants ----------------------------------------------------------------------

grant select, insert, update, delete on public.server_roles to authenticated;
grant select, insert, delete on public.server_member_roles to authenticated;
grant select, insert, update, delete on public.permission_overwrites to authenticated;

revoke all on function public.overwrites_allow_view(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_channel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_category(uuid) from public, anon;
grant execute on function public.can_view_category(uuid) to authenticated;
revoke all on function public.fill_member_role_server() from public, anon, authenticated;
revoke all on function public.fill_overwrite_server() from public, anon, authenticated;
revoke all on function public.drop_departed_member_permissions() from public, anon, authenticated;
