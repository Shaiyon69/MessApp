-- Purrch (notch app) replies carry origin 'purrch'. Deploy this before any
-- Purrch build that replies, or its inserts fail the check.
alter table public.messages
  drop constraint if exists messages_origin_check;
alter table public.messages
  add constraint messages_origin_check check (origin in ('messapp', 'chimaera', 'purrch'));
