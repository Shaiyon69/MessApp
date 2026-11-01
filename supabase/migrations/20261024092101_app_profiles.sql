-- Per-app profile overrides. MESSAPP keeps using public.profiles; Chimaera
-- reads and writes the app = 'chimaera' row and falls back to profiles when it is absent.
create table if not exists public.app_profiles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('messapp', 'chimaera')),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  avatar_url text,
  status_text text check (status_text is null or char_length(status_text) <= 80),
  status_expires_at timestamptz,
  bio text check (bio is null or char_length(bio) <= 300),
  banner_url text,
  updated_at timestamptz not null default now(),
  primary key (profile_id, app)
);

alter table public.app_profiles enable row level security;

-- Visible to exactly the people who can already see the base profile.
drop policy if exists "app_profiles_select_related" on public.app_profiles;
create policy "app_profiles_select_related"
on public.app_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p where p.id = app_profiles.profile_id
  )
);

drop policy if exists "app_profiles_insert_self" on public.app_profiles;
create policy "app_profiles_insert_self"
on public.app_profiles
for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "app_profiles_update_self" on public.app_profiles;
create policy "app_profiles_update_self"
on public.app_profiles
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "app_profiles_delete_self" on public.app_profiles;
create policy "app_profiles_delete_self"
on public.app_profiles
for delete
to authenticated
using (profile_id = (select auth.uid()));

revoke all on table public.app_profiles from anon, public;
grant select, insert, update, delete on table public.app_profiles to authenticated;
