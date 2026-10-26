-- What a message carries, so a push can say "Sent a photo" without reading the
-- (E2EE) content or racing the message_attachments insert that follows the
-- message row. Null means text. message_attachments.file_type already exposes
-- the same metadata, so this leaks nothing new. Chimaera may leave it null.
alter table public.messages
  add column if not exists attachment_kind text;

alter table public.messages
  drop constraint if exists messages_attachment_kind_check;
alter table public.messages
  add constraint messages_attachment_kind_check
  check (attachment_kind in ('photo', 'gif', 'video', 'voice', 'audio', 'file', 'mixed'));
