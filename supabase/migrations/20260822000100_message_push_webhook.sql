-- Fires send-message-push after each message insert. pg_net queues the request
-- asynchronously, so a slow or failing push endpoint never blocks message inserts.
-- ponytail: webhook secret is inlined in the function body (visible to anyone with
-- catalog read). Move to Vault if non-owner roles ever gain catalog access.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
begin
  -- Body mirrors the Supabase Database Webhook shape parseMessageWebhook expects.
  perform net.http_post(
    url := 'https://boxhdygkyopixoejztuk.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-messapp-webhook-secret', '<redacted: see 20261025000100_push_webhook_vault>'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'messages',
      'record', jsonb_build_object('id', new.id)
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.notify_message_push() from public, anon, authenticated;

drop trigger if exists messages_push_webhook on public.messages;
create trigger messages_push_webhook
after insert on public.messages
for each row execute function public.notify_message_push();
