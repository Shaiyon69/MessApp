alter table public.dm_rooms
  add column if not exists theme_id text not null default 'mono';

alter table public.servers
  add column if not exists theme_id text not null default 'mono';

update public.dm_rooms
set theme_id = case lower(coalesce(theme_color, ''))
  when '#6366f1' then 'lavender'
  when '#a855f7' then 'lavender'
  when '#ec4899' then 'sunset'
  when '#f43f5e' then 'sunset'
  when '#10b981' then 'forest'
  when '#f59e0b' then 'amber'
  else theme_id
end;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dm_rooms_theme_id_check'
  ) then
    alter table public.dm_rooms
      add constraint dm_rooms_theme_id_check
      check (theme_id in ('mono', 'ocean', 'forest', 'sunset', 'lavender', 'amber'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'servers_theme_id_check'
  ) then
    alter table public.servers
      add constraint servers_theme_id_check
      check (theme_id in ('mono', 'ocean', 'forest', 'sunset', 'lavender', 'amber'));
  end if;
end
$$;
