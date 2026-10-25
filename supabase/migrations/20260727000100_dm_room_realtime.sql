-- Conversation themes and wallpapers are shared room state. Both DM members
-- need UPDATE events without broadening table access beyond the existing RLS.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_rooms'
  ) then
    alter publication supabase_realtime add table public.dm_rooms;
  end if;
end $$;
