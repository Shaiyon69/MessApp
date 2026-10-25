-- 20260822000100 called extensions.net.http_post, but pg_net puts its functions in
-- schema "net" regardless of the extension's own schema. Postgres read that
-- three-part name as database "extensions" and every message insert failed with
-- 0A000 "cross-database references are not implemented". Call net.http_post instead.
create or replace function public.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $$
begin
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
