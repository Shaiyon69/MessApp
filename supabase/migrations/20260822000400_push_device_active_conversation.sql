-- Devices report the conversation they currently have on screen so the push
-- sender can stay quiet about a message the recipient is already reading.
-- The timestamp is what keeps a crashed or force-quit app from silencing that
-- conversation forever: the sender only honours a recent report.
alter table public.push_devices
  add column if not exists active_conversation_id uuid,
  add column if not exists active_conversation_at timestamptz;
