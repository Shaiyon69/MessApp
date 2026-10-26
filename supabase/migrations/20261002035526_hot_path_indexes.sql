-- Indexes for the columns the hot read paths actually filter on. Every table
-- below already had a primary key, but in each case the PK's leading column is
-- not the one the query filters by, so the planner fell back to a scan.
--
-- Purely additive: no policy, column, or data change.

-- The one that matters. message_attachments has only its `id` PK, so both the
-- message_attachments(*) embed in the message select and the EXISTS inside the
-- attachments_read_message RLS policy scan the whole table — once per attachment
-- row, on every page of every conversation.
create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

-- PK is (profile_id, dm_room_id) / (profile_id, channel_id), but every read
-- filters on the conversation first, which a leading-column index cannot serve.
create index if not exists dm_reads_room_profile_idx
  on public.dm_reads (dm_room_id, profile_id);

create index if not exists channel_reads_channel_profile_idx
  on public.channel_reads (channel_id, profile_id);

-- PK is (message_id, profile_id); "everything I have seen" cannot use it.
create index if not exists message_receipts_profile_idx
  on public.message_receipts (profile_id);

-- is_server_moderator() filters this table by server_id with nothing to help it.
create index if not exists server_moderation_events_server_idx
  on public.server_moderation_events (server_id);
