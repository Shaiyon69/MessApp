-- Every write to messages also updates each of its indexes, which costs Disk IO
-- on the Free plan. These two serve no query:
--   idx_messages_channel_id: idx_messages_channel (channel_id, created_at desc)
--     already serves every channel_id lookup.
--   idx_messages_is_edited: a boolean column, never filtered on its own.
-- Neither backs a constraint. Plain DROP INDEX holds a short lock on messages;
-- CONCURRENTLY cannot run inside the migration transaction.
drop index if exists public.idx_messages_channel_id;
drop index if exists public.idx_messages_is_edited;
