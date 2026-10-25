-- Custom status note, synced across a user's devices. Presence still carries
-- the note to other users; these columns only let a second device pick up the
-- note the first one set. Readable by the same people who can read the profile,
-- which is no wider than the presence channel that already broadcasts it.

alter table public.profiles
  add column if not exists status_text text
    check (status_text is null or char_length(status_text) <= 80),
  add column if not exists status_expires_at timestamptz;

grant select (status_text, status_expires_at) on table public.profiles to authenticated;
