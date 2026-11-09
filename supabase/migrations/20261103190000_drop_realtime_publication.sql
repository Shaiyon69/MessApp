-- Stop postgres_changes. While any table sits in supabase_realtime, Realtime keeps
-- decoding the WAL for its subscribers, and on the Free plan that drains the
-- Disk IO budget. Live updates now come from the Broadcast triggers in
-- 20261103155000_broadcast_realtime.sql, which current Messapp, Chimaera and
-- Purrch builds listen to.
--
-- Breaking for old builds: Messapp v1.3.0 and Chimaera builds released before
-- the broadcast switch lose live updates (refresh still works) until they update.
--
-- Rollback: alter publication supabase_realtime add table public.<name>; per table.
do $$
declare
  target_table text;
begin
  for target_table in
    select tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', target_table);
  end loop;
end $$;
