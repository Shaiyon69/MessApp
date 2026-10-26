-- Push tokens are private per-installation credentials. Device rows are owned by
-- the authenticated profile and are deleted when that profile is deleted.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  platform text not null,
  push_token text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_installation_id_length check (char_length(installation_id) between 16 and 200),
  constraint push_devices_platform_check check (platform in ('android', 'ios', 'web')),
  constraint push_devices_token_length check (char_length(push_token) between 1 and 8192)
);

create unique index if not exists push_devices_profile_installation_uidx
  on public.push_devices (profile_id, installation_id);

-- A provider token may move between installations after a refresh, but it must
-- never identify two enabled destinations at the same time.
create unique index if not exists push_devices_active_token_uidx
  on public.push_devices (md5(push_token))
  where enabled;

create index if not exists push_devices_profile_enabled_last_seen_idx
  on public.push_devices (profile_id, enabled, last_seen_at desc);

create index if not exists push_devices_enabled_platform_idx
  on public.push_devices (platform, last_seen_at desc)
  where enabled;

create or replace function public.set_push_device_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_devices_set_updated_at on public.push_devices;
create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function public.set_push_device_updated_at();

alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;

drop policy if exists "push_devices_select_own" on public.push_devices;
create policy "push_devices_select_own"
on public.push_devices for select to authenticated
using (profile_id = auth.uid());

drop policy if exists "push_devices_insert_own" on public.push_devices;
create policy "push_devices_insert_own"
on public.push_devices for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists "push_devices_update_own" on public.push_devices;
create policy "push_devices_update_own"
on public.push_devices for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "push_devices_delete_own" on public.push_devices;
create policy "push_devices_delete_own"
on public.push_devices for delete to authenticated
using (profile_id = auth.uid());

revoke all on public.push_devices from public, anon;
grant select, insert, update, delete on public.push_devices to authenticated;
grant all on public.push_devices to service_role;

revoke all on function public.set_push_device_updated_at() from public, anon;
grant execute on function public.set_push_device_updated_at() to authenticated, service_role;
