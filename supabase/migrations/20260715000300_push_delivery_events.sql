-- Delivery events contain identifiers and safe provider status codes only. They
-- are intentionally service-role-only because clients must not infer recipients.
create table if not exists public.push_delivery_events (
  event_key text primary key,
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  status text not null default 'processing',
  attempts integer not null default 1,
  last_error_code text,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint push_delivery_events_identity_unique unique (message_id, profile_id, installation_id),
  constraint push_delivery_events_status_check check (status in ('processing', 'sent', 'failed')),
  constraint push_delivery_events_attempts_check check (attempts > 0),
  constraint push_delivery_events_error_code_check check (
    last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,80}$'
  )
);

create index if not exists push_delivery_events_status_claimed_idx
  on public.push_delivery_events (status, claimed_at);

create index if not exists push_delivery_events_profile_created_idx
  on public.push_delivery_events (profile_id, created_at desc);

alter table public.push_delivery_events enable row level security;
alter table public.push_delivery_events force row level security;

-- No client policies are created: even row existence is private delivery data.
revoke all on public.push_delivery_events from public, anon, authenticated;
grant select, insert, update, delete on public.push_delivery_events to service_role;

-- Atomically claims one delivery. Failed attempts and abandoned five-minute
-- leases may retry, while confirmed sends can never be claimed again.
create or replace function public.claim_push_delivery_event(
  target_event_key text,
  target_message_id uuid,
  target_profile_id uuid,
  target_installation_id text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  claimed_key text;
begin
  insert into public.push_delivery_events (
    event_key,
    message_id,
    profile_id,
    installation_id,
    status,
    attempts,
    claimed_at
  ) values (
    target_event_key,
    target_message_id,
    target_profile_id,
    target_installation_id,
    'processing',
    1,
    now()
  )
  on conflict (event_key) do update
    set status = 'processing',
        attempts = public.push_delivery_events.attempts + 1,
        last_error_code = null,
        claimed_at = now()
    where public.push_delivery_events.status = 'failed'
       or (
         public.push_delivery_events.status = 'processing'
         and public.push_delivery_events.claimed_at < now() - interval '5 minutes'
       )
  returning event_key into claimed_key;

  return claimed_key is not null;
end;
$$;

revoke all on function public.claim_push_delivery_event(text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery_event(text, uuid, uuid, text)
  to service_role;
