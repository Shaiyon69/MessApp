-- Disappearing messages. The sender chooses a lifetime in the composer and it
-- is stored as an absolute stamp on the row. Expiry is enforced in the read
-- policy, not only in the client, so a message that has passed is gone for
-- anyone who queries it again — including a client that kept its own cache.

alter table public.messages
  add column if not exists expires_at timestamptz;

-- Partial: only disappearing messages ever carry a value, and they are the rare
-- case, so the index stays small enough for the sweep below to use it.
create index if not exists messages_expires_at_idx
  on public.messages (expires_at)
  where expires_at is not null;

drop policy if exists "messages_read_participant" on public.messages;

create policy "messages_read_participant"
on public.messages
for select
to authenticated
using (
  (expires_at is null or expires_at > now())
  and (
    (
      dm_room_id is not null
      and public.is_dm_member(dm_room_id)
    )
    or (
      channel_id is not null
      and public.is_channel_member(channel_id)
    )
  )
);

-- Hiding the rows is what the product promises; reclaiming them still needs a
-- scheduled caller. Left as an explicit service_role entry point rather than a
-- pg_cron job, because this project does not run pg_cron yet.
create or replace function public.delete_expired_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with removed as (
    delete from public.messages
    where expires_at is not null
      and expires_at <= now()
    returning 1
  )
  select count(*)::int from removed;
$$;

revoke all on function public.delete_expired_messages() from public;
revoke all on function public.delete_expired_messages() from anon;
revoke all on function public.delete_expired_messages() from authenticated;
grant execute on function public.delete_expired_messages() to service_role;
