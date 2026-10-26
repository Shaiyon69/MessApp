alter table public.servers
  add column if not exists wallpaper text not null default 'default';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'servers_wallpaper_check'
  ) then
    alter table public.servers
      add constraint servers_wallpaper_check
      check (wallpaper in (
        'none',
        'default',
        'doodles',
        'galaxy',
        'emerald',
        'topography',
        'midnight',
        'confetti',
        'waves',
        'sunrise',
        'checker',
        'petals'
      ));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'servers'
  ) then
    alter publication supabase_realtime add table public.servers;
  end if;
end
$$;
