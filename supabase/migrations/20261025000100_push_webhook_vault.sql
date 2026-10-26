-- Reads the push webhook secret from Vault instead of inlining it in the function
-- bodies (20260822000100/200/300). Create the secret first, named push_webhook_secret:
--   select vault.create_secret('<new hex secret>', 'push_webhook_secret');
-- and set the same value as MESSAPP_PUSH_WEBHOOK_SECRET on send-message-push.
-- A missing secret skips the push instead of failing the insert: push is best-effort.
create or replace function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if webhook_secret is null then
    raise warning 'push_webhook_secret missing in vault; skipping message push';
    return new;
  end if;

  perform net.http_post(
    url := 'https://boxhdygkyopixoejztuk.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-messapp-webhook-secret', webhook_secret
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

create or replace function public.notify_friend_request_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault, pg_temp
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  if webhook_secret is null then
    raise warning 'push_webhook_secret missing in vault; skipping friend request push';
    return new;
  end if;

  perform net.http_post(
    url := 'https://boxhdygkyopixoejztuk.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-messapp-webhook-secret', webhook_secret
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
