-- Polls in server channels. A poll is an ordinary message whose content reads
-- "📊 <question>", plus a polls row keyed by that message, so every existing
-- surface (previews, search, push, deletion) treats it as a message for free.
-- Server channels only: a poll in an E2EE DM would store its options in
-- plaintext on the server.
--
-- Clients never write these tables directly; create_poll and vote_poll do,
-- after the same membership and timeout checks a channel message insert gets.

create table if not exists public.polls (
  message_id uuid primary key references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  options text[] not null check (array_length(options, 1) between 2 and 10),
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  message_id uuid not null references public.polls(message_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  option_index smallint not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, option_index)
);

-- Realtime DELETE events need the old row to apply the message_id filter.
alter table public.poll_votes replica identity full;

alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

revoke all on table public.polls, public.poll_votes from anon, authenticated;
grant select on table public.polls, public.poll_votes to authenticated;

drop policy if exists polls_select_member on public.polls;
create policy polls_select_member on public.polls
  for select to authenticated
  using (public.is_channel_member(channel_id));

drop policy if exists poll_votes_select_member on public.poll_votes;
create policy poll_votes_select_member on public.poll_votes
  for select to authenticated
  using (exists (
    select 1 from public.polls p
    where p.message_id = poll_votes.message_id
      and public.is_channel_member(p.channel_id)
  ));

create or replace function public.create_poll(
  target_channel_id uuid,
  poll_question text,
  poll_options text[],
  poll_allow_multiple boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  clean_question text := trim(poll_question);
  clean_options text[];
  new_message_id uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if not public.is_channel_member(target_channel_id, actor) then
    raise exception 'channel access required';
  end if;
  if public.is_timed_out_in_channel(target_channel_id) then
    raise exception 'you are timed out in this server';
  end if;

  select array_agg(trim(option) order by ordinality)
    into clean_options
  from unnest(poll_options) with ordinality as option
  where trim(option) <> '';

  if clean_question = '' or char_length(clean_question) > 200 then
    raise exception 'poll question must be 1 to 200 characters';
  end if;
  if coalesce(array_length(clean_options, 1), 0) not between 2 and 10 then
    raise exception 'a poll needs 2 to 10 options';
  end if;
  if exists (select 1 from unnest(clean_options) option where char_length(option) > 80) then
    raise exception 'poll options must be 80 characters or fewer';
  end if;

  insert into public.messages(channel_id, profile_id, content)
  values (target_channel_id, actor, '📊 ' || clean_question)
  returning id into new_message_id;

  insert into public.polls(message_id, channel_id, question, options, allow_multiple)
  values (new_message_id, target_channel_id, clean_question, clean_options, coalesce(poll_allow_multiple, false));

  return new_message_id;
end;
$$;

revoke all on function public.create_poll(uuid, text, text[], boolean) from public, anon;
grant execute on function public.create_poll(uuid, text, text[], boolean) to authenticated;

-- Replaces the caller's votes on one poll. An empty array retracts them.
create or replace function public.vote_poll(
  target_message_id uuid,
  option_indexes smallint[]
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  poll public.polls;
  picked smallint[];
begin
  if actor is null then raise exception 'authentication required'; end if;

  select * into poll from public.polls where message_id = target_message_id;
  if poll.message_id is null or not public.is_channel_member(poll.channel_id, actor) then
    raise exception 'poll not found';
  end if;
  if public.is_timed_out_in_channel(poll.channel_id) then
    raise exception 'you are timed out in this server';
  end if;

  select coalesce(array_agg(distinct index), '{}') into picked
  from unnest(coalesce(option_indexes, '{}')) as index;

  if exists (select 1 from unnest(picked) index where index < 0 or index >= array_length(poll.options, 1)) then
    raise exception 'invalid poll option';
  end if;
  if not poll.allow_multiple and array_length(picked, 1) > 1 then
    raise exception 'this poll allows one choice';
  end if;

  delete from public.poll_votes where message_id = target_message_id and profile_id = actor;
  insert into public.poll_votes(message_id, profile_id, option_index)
  select target_message_id, actor, index from unnest(picked) index;
end;
$$;

revoke all on function public.vote_poll(uuid, smallint[]) from public, anon;
grant execute on function public.vote_poll(uuid, smallint[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'poll_votes'
  ) then
    alter publication supabase_realtime add table public.poll_votes;
  end if;
end $$;
