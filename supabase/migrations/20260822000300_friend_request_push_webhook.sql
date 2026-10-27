-- Fires send-message-push after each pending friend request insert. Mirrors
-- notify_message_push(): pg_net queues the request asynchronously, so a slow or
-- failing push endpoint never blocks the friendships insert.
-- ponytail: webhook secret is inlined in the function body (visible to anyone with
-- catalog read), same as notify_message_push. Move both to Vault together if
-- non-owner roles ever gain catalog access.
create or replace function public.notify_friend_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
begin
  -- Body mirrors the Supabase Database Webhook shape parsePushWebhook expects.
  perform net.http_post(
    url := 'https://boxhdygkyopixoejztuk.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-messapp-webhook-secret', '<redacted: see 20261025124955_push_webhook_vault>'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'friendships',
      'record', jsonb_build_object('id', new.id)
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.notify_friend_request_push() from public, anon, authenticated;

-- Only an actual pending request notifies. Rows inserted already accepted (or in
-- any other state) are not a request the receiver has to act on.
drop trigger if exists friendships_push_webhook on public.friendships;
create trigger friendships_push_webhook
after insert on public.friendships
for each row when (new.status = 'pending')
execute function public.notify_friend_request_push();
