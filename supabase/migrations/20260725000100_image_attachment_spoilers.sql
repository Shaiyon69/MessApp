alter table public.messages
  add column if not exists is_spoiler boolean not null default false;

alter table public.message_attachments
  add column if not exists is_spoiler boolean not null default false;

revoke update on table public.message_attachments from authenticated;
grant update (is_spoiler) on table public.message_attachments to authenticated;

drop policy if exists "message_attachments_update_message_owner" on public.message_attachments;
create policy "message_attachments_update_message_owner"
on public.message_attachments
for update
to authenticated
using (
  exists (
    select 1
    from public.messages
    where messages.id = message_attachments.message_id
      and messages.profile_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.messages
    where messages.id = message_attachments.message_id
      and messages.profile_id = auth.uid()
  )
);
