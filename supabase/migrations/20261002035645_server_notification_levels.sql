-- Per-server notification level replaces the single muted flag:
--   all      every channel message pushes (the old unmuted state)
--   mentions only messages that @mention the member push
--   none     nothing pushes (the old muted state)
-- `muted` stays as a generated column so builds that still read it keep working;
-- writes to it now fail, and those builds already treat a failed write as
-- "preference unavailable".

alter table public.server_notification_preferences
  add column if not exists level text not null default 'all'
  check (level in ('all', 'mentions', 'none'));

update public.server_notification_preferences
  set level = 'none'
  where muted and level = 'all';

alter table public.server_notification_preferences drop column if exists muted;
alter table public.server_notification_preferences
  add column muted boolean generated always as (level = 'none') stored;
