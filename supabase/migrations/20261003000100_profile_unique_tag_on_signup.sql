-- handle_new_user only copied username, so the profile row existed before the client's first
-- sync and the client never wrote unique_tag (it only inserts when no row exists). Friend lookup
-- by name#0000 matches profiles.unique_tag, so those users were unfindable.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tag text := nullif(trim(new.raw_user_meta_data->>'unique_tag'), '');
begin
  -- A taken tag would abort signup on profiles_unique_tag_key; leave it null instead.
  if tag is not null and exists (select 1 from public.profiles where lower(unique_tag) = lower(tag)) then
    tag := null;
  end if;
  insert into public.profiles (id, username, unique_tag)
  values (new.id, new.raw_user_meta_data->>'username', tag);
  return new;
end;
$$;

update public.profiles p
set unique_tag = nullif(trim(u.raw_user_meta_data->>'unique_tag'), '')
from auth.users u
where u.id = p.id
  and p.unique_tag is null
  and nullif(trim(u.raw_user_meta_data->>'unique_tag'), '') is not null
  and not exists (
    select 1 from public.profiles o
    where lower(o.unique_tag) = lower(trim(u.raw_user_meta_data->>'unique_tag'))
  );
