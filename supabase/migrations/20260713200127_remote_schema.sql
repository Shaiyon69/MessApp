


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."ban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid", "ban_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); actor_role text; target_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if target_profile_id is null or target_profile_id = actor then raise exception 'use leave server for your own membership'; end if;
  if ban_reason is not null and char_length(trim(ban_reason)) > 500 then raise exception 'ban reason is too long'; end if;
  select role into actor_role from public.server_members where server_id = target_server_id and profile_id = actor;
  select role into target_role from public.server_members where server_id = target_server_id and profile_id = target_profile_id for update;
  if actor_role not in ('owner', 'admin') then raise exception 'manager access required'; end if;
  if target_role is null then raise exception 'member not found'; end if;
  if target_role = 'owner' or (actor_role = 'admin' and target_role in ('owner', 'admin')) then
    raise exception 'this member is protected';
  end if;
  insert into public.server_bans(server_id, profile_id, banned_by, reason)
  values (target_server_id, target_profile_id, actor, nullif(trim(ban_reason), ''))
  on conflict (server_id, profile_id) do update
    set banned_by = excluded.banned_by, reason = excluded.reason, created_at = now();
  delete from public.server_members where server_id = target_server_id and profile_id = target_profile_id;
end $$;


ALTER FUNCTION "public"."ban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid", "ban_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_message"("target_message_id" "uuid", "user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and exists (
      select 1
      from public.messages m
      left join public.channels ch on ch.id = m.channel_id
      left join public.categories cat on cat.id = ch.category_id
      where m.id = target_message_id
        and (
          (m.dm_room_id is not null and exists (
            select 1 from public.dm_members dm
            where dm.dm_room_id = m.dm_room_id and dm.profile_id = auth.uid()
          ))
          or
          (m.channel_id is not null and exists (
            select 1 from public.server_members sm
            where sm.server_id = cat.server_id and sm.profile_id = auth.uid()
          ))
        )
    )
$$;


ALTER FUNCTION "public"."can_access_message"("target_message_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_server"("target_server_id" "uuid", "user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and exists (
    select 1 from public.server_members
    where server_id = target_server_id and profile_id = auth.uid() and role in ('owner', 'admin')
  )
$$;


ALTER FUNCTION "public"."can_manage_server"("target_server_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_report_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare source_message public.messages%rowtype; source_server public.servers%rowtype;
begin
  if auth.uid() is null or new.reporter_id <> auth.uid() then raise exception 'reporter mismatch'; end if;
  if new.target_type = 'message' then
    select * into source_message from public.messages where id = new.target_id;
    if source_message.id is null or not public.can_access_message(new.target_id, auth.uid()) then raise exception 'message is not reportable'; end if;
    new.reported_user_id := source_message.profile_id;
    new.target_snapshot := jsonb_build_object(
      'message_id', source_message.id, 'author_id', source_message.profile_id,
      'content', case when source_message.is_encrypted then new.client_content else source_message.content end,
      'content_source', case when source_message.is_encrypted then 'reporter_client' else 'database' end,
      'created_at', source_message.created_at, 'channel_id', source_message.channel_id, 'dm_room_id', source_message.dm_room_id
    );
  elsif new.target_type = 'user' then
    if not exists(select 1 from public.profiles where id = new.target_id) then raise exception 'user is not reportable'; end if;
    new.reported_user_id := new.target_id;
    new.target_snapshot := jsonb_build_object('profile_id', new.target_id);
  elsif new.target_type = 'server' then
    select * into source_server from public.servers where id = new.target_id;
    if source_server.id is null or not public.is_server_member(source_server.id) then raise exception 'server is not reportable'; end if;
    new.reported_user_id := source_server.owner_id;
    new.target_snapshot := jsonb_build_object('server_id', source_server.id, 'name', source_server.name, 'owner_id', source_server.owner_id);
  end if;
  if new.reported_user_id = auth.uid() then raise exception 'self reports are not allowed'; end if;
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."capture_report_snapshot"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."dm_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dm_room_id" "uuid" NOT NULL,
    "caller_id" "uuid" NOT NULL,
    "callee_id" "uuid" NOT NULL,
    "call_type" "text" NOT NULL,
    "state" "text" DEFAULT 'ringing'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answered_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:00:30'::interval) NOT NULL,
    CONSTRAINT "dm_calls_call_type_check" CHECK (("call_type" = ANY (ARRAY['audio'::"text", 'video'::"text"]))),
    CONSTRAINT "dm_calls_distinct_parties" CHECK (("caller_id" <> "callee_id")),
    CONSTRAINT "dm_calls_state_check" CHECK (("state" = ANY (ARRAY['ringing'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text", 'timed_out'::"text", 'ended'::"text", 'failed'::"text", 'busy'::"text"])))
);


ALTER TABLE "public"."dm_calls" OWNER TO "postgres";


COMMENT ON TABLE "public"."dm_calls" IS 'Authenticated one-to-one DM call lifecycle used for party-scoped Realtime signaling; media room names are never stored client-side.';



CREATE OR REPLACE FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") RETURNS "public"."dm_calls"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  peer uuid;
  first_lock uuid;
  second_lock uuid;
  created_call public.dm_calls;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if requested_kind not in ('audio', 'video') then raise exception 'unsupported call type'; end if;
  if not exists (
    select 1 from public.dm_members
    where dm_room_id = target_room_id and profile_id = actor
  ) then raise exception 'direct message membership required'; end if;

  select m.profile_id into peer
  from public.dm_members m
  where m.dm_room_id = target_room_id and m.profile_id <> actor
  order by m.profile_id
  limit 1;

  if peer is null or (
    select count(distinct profile_id) from public.dm_members where dm_room_id = target_room_id
  ) <> 2 then
    raise exception 'one-to-one direct message required';
  end if;

  if public.users_blocked(actor, peer) then raise exception 'calls are blocked'; end if;
  if not coalesce((select allow_dms from public.profiles where id = peer), true) then
    raise exception 'user is not accepting calls';
  end if;

  first_lock := least(actor, peer);
  second_lock := greatest(actor, peer);
  perform pg_advisory_xact_lock(hashtextextended('dm-call-user:' || first_lock::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('dm-call-user:' || second_lock::text, 0));

  update public.dm_calls
  set state = 'timed_out', ended_at = now()
  where state = 'ringing'
    and expires_at <= now()
    and (caller_id in (actor, peer) or callee_id in (actor, peer));

  if exists (
    select 1 from public.dm_calls
    where state in ('ringing', 'accepted')
      and expires_at > now()
      and (caller_id in (actor, peer) or callee_id in (actor, peer))
  ) then
    raise exception 'user is busy';
  end if;

  insert into public.dm_calls(dm_room_id, caller_id, callee_id, call_type)
  values (target_room_id, actor, peer, requested_kind)
  returning * into created_call;
  return created_call;
end $$;


ALTER FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") IS 'Derives caller/callee from auth.uid() and DM membership, then enforces blocks, privacy, and busy state.';



CREATE TABLE IF NOT EXISTS "public"."dm_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "theme" "text" DEFAULT '99 102 241'::"text",
    "wallpaper" "text" DEFAULT 'default'::"text",
    "theme_color" "text" DEFAULT '#6366f1'::"text"
);


ALTER TABLE "public"."dm_rooms" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_or_get_dm"("peer_id" "uuid") RETURNS "public"."dm_rooms"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); room public.dm_rooms; lock_key text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if peer_id is null or not exists(select 1 from public.profiles where id = peer_id) then raise exception 'user not found'; end if;
  if peer_id <> actor and public.users_blocked(actor, peer_id) then raise exception 'direct messages are blocked'; end if;
  if peer_id <> actor and not coalesce((select allow_dms from public.profiles where id = peer_id), true) then raise exception 'user is not accepting direct messages'; end if;
  lock_key := least(actor::text, peer_id::text) || ':' || greatest(actor::text, peer_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  select r.* into room from public.dm_rooms r
  where exists(select 1 from public.dm_members m where m.dm_room_id = r.id and m.profile_id = actor)
    and exists(select 1 from public.dm_members m where m.dm_room_id = r.id and m.profile_id = peer_id)
    and (select count(distinct m.profile_id) from public.dm_members m where m.dm_room_id = r.id) = case when peer_id = actor then 1 else 2 end
  order by r.created_at asc limit 1;
  if room.id is not null then return room; end if;
  insert into public.dm_rooms default values returning * into room;
  insert into public.dm_members(dm_room_id, profile_id) values (room.id, actor);
  if peer_id <> actor then insert into public.dm_members(dm_room_id, profile_id) values (room.id, peer_id); end if;
  return room;
end $$;


ALTER FUNCTION "public"."create_or_get_dm"("peer_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "icon_url" "text"
);


ALTER TABLE "public"."servers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") RETURNS "public"."servers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  clean_name text := trim(server_name);
  existing_server public.servers;
  created_server public.servers;
  created_category uuid;
  invite_code text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if idempotency_key is null then raise exception 'request id required'; end if;
  if char_length(clean_name) not between 1 and 100 then raise exception 'server name must be 1 to 100 characters'; end if;
  if not exists (select 1 from public.profiles where id = actor) then raise exception 'profile required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || idempotency_key::text, 0));
  select s.* into existing_server
  from public.server_creation_requests r
  join public.servers s on s.id = r.server_id
  where r.profile_id = actor and r.request_id = idempotency_key;
  if existing_server.id is not null then return existing_server; end if;

  loop
    invite_code := upper(substr(encode(extensions.messapp_random_bytes(9), 'hex'), 1, 12));
    exit when not exists (select 1 from public.invites where upper(code) = invite_code);
  end loop;

  insert into public.servers(name, owner_id)
  values (clean_name, actor)
  returning * into created_server;
  insert into public.server_members(server_id, profile_id, role)
  values (created_server.id, actor, 'owner');
  insert into public.categories(server_id, name, position)
  values (created_server.id, 'General', 0)
  returning id into created_category;
  insert into public.channels(category_id, name, type, position)
  values (created_category, 'general', 'text', 0);
  insert into public.invites(server_id, created_by, code, uses_left)
  values (created_server.id, actor, invite_code, null);
  insert into public.server_creation_requests(profile_id, request_id, server_id)
  values (actor, idempotency_key, created_server.id);
  return created_server;
end $$;


ALTER FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") IS 'Creates the server, owner membership, General category, general text channel, and cryptographic invite atomically; request_id makes retries idempotent.';



CREATE TABLE IF NOT EXISTS "public"."invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "uses_left" integer DEFAULT 100,
    "code" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "invites_uses_left_valid" CHECK ((("uses_left" IS NULL) OR ("uses_left" >= 0)))
);


ALTER TABLE "public"."invites" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_server_invite"("target_server_id" "uuid", "requested_uses" integer DEFAULT 100, "requested_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."invites"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); created_invite public.invites; generated_code text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if not public.can_manage_server(target_server_id) then raise exception 'manager access required'; end if;
  if requested_uses is not null and requested_uses not between 1 and 10000 then raise exception 'uses must be between 1 and 10000'; end if;
  if requested_expires_at is not null and requested_expires_at <= now() then raise exception 'expiry must be in the future'; end if;
  loop
    generated_code := upper(substr(encode(extensions.messapp_random_bytes(9), 'hex'), 1, 12));
    exit when not exists (select 1 from public.invites where upper(code) = generated_code);
  end loop;
  insert into public.invites(server_id, created_by, code, uses_left, expires_at)
  values (target_server_id, actor, generated_code, requested_uses, requested_expires_at)
  returning * into created_invite;
  return created_invite;
end $$;


ALTER FUNCTION "public"."create_server_invite"("target_server_id" "uuid", "requested_uses" integer, "requested_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_server"("target_server_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication required'; end if;
  perform 1 from public.servers where id = target_server_id and owner_id = actor for update;
  if not found then raise exception 'owner access required'; end if;

  insert into public.storage_deletion_queue(bucket_id, object_path, reason, requested_by)
  select 'chat-attachments', ma.file_url, 'server_deleted', actor
  from public.message_attachments ma
  join public.messages m on m.id = ma.message_id
  join public.channels ch on ch.id = m.channel_id
  join public.categories c on c.id = ch.category_id
  where c.server_id = target_server_id and ma.file_url is not null
  on conflict do nothing;
  delete from public.message_receipts where message_id in (
    select m.id from public.messages m join public.channels ch on ch.id = m.channel_id join public.categories c on c.id = ch.category_id where c.server_id = target_server_id
  );
  delete from public.message_reactions where message_id in (
    select m.id from public.messages m join public.channels ch on ch.id = m.channel_id join public.categories c on c.id = ch.category_id where c.server_id = target_server_id
  );
  delete from public.message_attachments where message_id in (
    select m.id from public.messages m join public.channels ch on ch.id = m.channel_id join public.categories c on c.id = ch.category_id where c.server_id = target_server_id
  );
  update public.messages set reply_to_message_id = null where reply_to_message_id in (
    select m.id from public.messages m join public.channels ch on ch.id = m.channel_id join public.categories c on c.id = ch.category_id where c.server_id = target_server_id
  );
  delete from public.messages where channel_id in (
    select ch.id from public.channels ch join public.categories c on c.id = ch.category_id where c.server_id = target_server_id
  );
  delete from public.servers where id = target_server_id;
end $$;


ALTER FUNCTION "public"."delete_server"("target_server_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Delete the user from the auth schema.
  -- Assuming you have cascading deletes set up on your profiles and messages tables,
  -- deleting from auth.users will automatically clean up the rest of their data.
  delete from auth.users where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."delete_user_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage', 'pg_temp'
    AS $$
declare
  target_user uuid := auth.uid();
  owned_room uuid;
begin
  if target_user is null then raise exception 'authentication required'; end if;

  insert into public.storage_deletion_queue(bucket_id, object_path, reason, requested_by)
  select 'chat-attachments', ma.file_url, 'account_deleted', target_user
  from public.message_attachments ma
  join public.messages m on m.id = ma.message_id
  where m.profile_id = target_user and ma.file_url is not null
  on conflict do nothing;

  insert into public.storage_deletion_queue(bucket_id, object_path, reason, requested_by)
  select 'chat-attachments', ma.file_url, 'account_deleted', target_user
  from public.message_attachments ma
  join public.messages m on m.id = ma.message_id
  join public.channels ch on ch.id = m.channel_id
  join public.categories c on c.id = ch.category_id
  where c.server_id in (
    select id from public.servers where owner_id = target_user
  ) and ma.file_url is not null
  on conflict do nothing;

  update public.content_reports
    set reported_user_id = null,
        target_snapshot = jsonb_build_object('deleted_subject', true),
        updated_at = now()
    where reported_user_id = target_user;

  delete from public.moderation_actions
  where moderator_id = target_user
     or subject_user_id = target_user
     or report_id in (
       select id from public.content_reports where reporter_id = target_user
     );
  delete from public.content_reports where reporter_id = target_user;

  delete from public.dm_calls
  where caller_id = target_user or callee_id = target_user;
  delete from public.media_token_issuance where profile_id = target_user;
  delete from public.server_bans
  where profile_id = target_user or banned_by = target_user;

  delete from public.message_receipts
  where profile_id = target_user
     or message_id in (select id from public.messages where profile_id = target_user);
  delete from public.message_reactions
  where profile_id = target_user
     or message_id in (select id from public.messages where profile_id = target_user);
  delete from public.message_attachments
  where message_id in (select id from public.messages where profile_id = target_user);
  update public.messages set reply_to_message_id = null
  where reply_to_message_id in (
    select id from public.messages where profile_id = target_user
  );
  delete from public.messages where profile_id = target_user;

  -- Owned servers cascade categories/channels/messages after attachment cleanup
  -- has been queued above.
  delete from public.servers where owner_id = target_user;

  delete from public.channel_reads where profile_id = target_user;
  delete from public.dm_reads where profile_id = target_user;
  delete from public.friendships
    where sender_id = target_user or receiver_id = target_user;
  delete from public.user_relationships
    where blocker_id = target_user or blocked_id = target_user;
  delete from public.server_members where profile_id = target_user;
  delete from public.moderator_roles where profile_id = target_user;
  delete from public.user_settings where user_id = target_user;
  delete from public.dm_members where profile_id = target_user;

  for owned_room in
    select r.id
    from public.dm_rooms r
    where not exists (
      select 1 from public.dm_members m where m.dm_room_id = r.id
    )
  loop
    delete from public.dm_rooms where id = owned_room;
  end loop;

  delete from public.profiles where id = target_user;
end $$;


ALTER FUNCTION "public"."delete_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_dm_call"("target_call_id" "uuid", "final_state" "text" DEFAULT 'ended'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  target public.dm_calls;
  normalized_state text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into target from public.dm_calls where id = target_call_id for update;
  if target.id is null or actor not in (target.caller_id, target.callee_id) then raise exception 'call not found'; end if;
  if target.state not in ('ringing', 'accepted') then return; end if;
  normalized_state := case
    when final_state in ('declined', 'cancelled', 'timed_out', 'ended', 'failed', 'busy') then final_state
    when target.state = 'ringing' then 'cancelled'
    else 'ended'
  end;
  update public.dm_calls set state = normalized_state, ended_at = now() where id = target.id;
end $$;


ALTER FUNCTION "public"."end_dm_call"("target_call_id" "uuid", "final_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_channel_server_on_move"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare old_server uuid; new_server uuid;
begin
  if new.category_id is distinct from old.category_id then
    select server_id into old_server from public.categories where id = old.category_id;
    select server_id into new_server from public.categories where id = new.category_id;
    if old_server is null or new_server is null or old_server <> new_server then
      raise exception 'channels cannot move between servers';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."enforce_channel_server_on_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_message_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare reply_message public.messages;
begin
  if tg_op = 'UPDATE' and (
    new.profile_id is distinct from old.profile_id
    or new.channel_id is distinct from old.channel_id
    or new.dm_room_id is distinct from old.dm_room_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'message author and conversation are immutable';
  end if;
  if new.reply_to_message_id is not null then
    select * into reply_message from public.messages where id = new.reply_to_message_id;
    if reply_message.id is null
      or reply_message.channel_id is distinct from new.channel_id
      or reply_message.dm_room_id is distinct from new.dm_room_id then
      raise exception 'reply target must belong to the same conversation';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."enforce_message_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  resulting_room public.dm_rooms;
begin
  resulting_room := public.create_or_get_dm(other_profile_id);

  if resulting_room.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'DM room was not returned';
  end if;

  return resulting_room.id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") IS 'Compatibility wrapper around create_or_get_dm(peer_id uuid).';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_channel_member"("target_channel_id" "uuid", "target_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = target_channel_id
      and sm.profile_id = target_profile_id
  );
$$;


ALTER FUNCTION "public"."is_channel_member"("target_channel_id" "uuid", "target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dm_member"("target_room_id" "uuid", "user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and exists (
      select 1 from public.dm_members
      where dm_room_id = target_room_id and profile_id = auth.uid()
    )
$$;


ALTER FUNCTION "public"."is_dm_member"("target_room_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and exists (
      select 1 from public.moderator_roles where profile_id = auth.uid()
    )
$$;


ALTER FUNCTION "public"."is_moderator"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_server_member"("target_server_id" "uuid", "user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and (user_id is null or user_id = auth.uid())
    and exists (
    select 1 from public.server_members
    where server_id = target_server_id and profile_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."is_server_member"("target_server_id" "uuid", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_server_moderator"("target_server_id" "uuid", "target_profile_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.server_members
    where server_id = target_server_id
      and profile_id = target_profile_id
      and role in ('owner', 'admin', 'moderator')
  ) or exists (
    select 1
    from public.servers
    where id = target_server_id
      and owner_id = target_profile_id
  );
$$;


ALTER FUNCTION "public"."is_server_moderator"("target_server_id" "uuid", "target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_server_by_code"("invite" "text") RETURNS "public"."servers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  matched_invite public.invites;
  matched_server public.servers;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if nullif(trim(invite), '') is null then raise exception 'invalid invite'; end if;

  select * into matched_invite
  from public.invites
  where upper(code) = upper(trim(invite))
  for update;
  if matched_invite.id is null then raise exception 'invalid invite'; end if;
  if matched_invite.revoked_at is not null then raise exception 'invite revoked'; end if;
  if matched_invite.expires_at is not null and matched_invite.expires_at <= now() then raise exception 'invite expired'; end if;
  if matched_invite.uses_left is not null and matched_invite.uses_left <= 0 then raise exception 'invite exhausted'; end if;
  if exists (select 1 from public.server_bans where server_id = matched_invite.server_id and profile_id = actor) then
    raise exception 'membership unavailable';
  end if;
  select * into matched_server from public.servers where id = matched_invite.server_id;
  if matched_server.id is null then raise exception 'invalid invite'; end if;
  if public.users_blocked(actor, matched_server.owner_id) then raise exception 'membership unavailable'; end if;

  if exists (select 1 from public.server_members where server_id = matched_server.id and profile_id = actor) then
    return matched_server;
  end if;
  insert into public.server_members(server_id, profile_id, role)
  values (matched_server.id, actor, 'member');
  if matched_invite.uses_left is not null then
    update public.invites set uses_left = uses_left - 1 where id = matched_invite.id;
  end if;
  return matched_server;
end $$;


ALTER FUNCTION "public"."join_server_by_code"("invite" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."join_server_by_code"("invite" "text") IS 'Derives membership identity from auth.uid(), locks invite usage, and rejects invalid, expired, revoked, exhausted, banned, or owner-blocked joins.';



CREATE OR REPLACE FUNCTION "public"."leave_server"("target_server_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); current_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select role into current_role from public.server_members
  where server_id = target_server_id and profile_id = actor for update;
  if current_role is null then return; end if;
  if current_role = 'owner' then raise exception 'transfer ownership or delete the server before leaving'; end if;
  delete from public.server_members where server_id = target_server_id and profile_id = actor;
end $$;


ALTER FUNCTION "public"."leave_server"("target_server_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_report"("target_report_id" "uuid", "moderation_action" "text", "moderation_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target_report public.content_reports%rowtype;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'moderator access required'; end if;
  if moderation_action not in ('dismiss', 'remove_message', 'escalate') then raise exception 'unsupported moderation action'; end if;
  if moderation_note is null or char_length(trim(moderation_note)) not between 1 and 2000 then raise exception 'moderation note required'; end if;
  select * into target_report from public.content_reports where id = target_report_id for update;
  if target_report.id is null then raise exception 'report not found'; end if;
  if target_report.status in ('actioned','dismissed') then raise exception 'report already resolved'; end if;

  if moderation_action = 'remove_message' then
    if target_report.target_type <> 'message' then raise exception 'report does not target a message'; end if;
    delete from public.message_receipts where message_id = target_report.target_id;
    delete from public.message_reactions where message_id = target_report.target_id;
    delete from public.message_attachments where message_id = target_report.target_id;
    update public.messages set reply_to_message_id = null where reply_to_message_id = target_report.target_id;
    delete from public.messages where id = target_report.target_id;
  end if;

  insert into public.moderation_actions(report_id, moderator_id, subject_user_id, action, note)
    values (target_report.id, auth.uid(), target_report.reported_user_id, moderation_action, trim(moderation_note));
  update public.content_reports set
    status = case when moderation_action = 'dismiss' then 'dismissed' when moderation_action = 'escalate' then 'reviewing' else 'actioned' end,
    assigned_to = auth.uid(), resolution_note = trim(moderation_note),
    resolved_at = case when moderation_action = 'escalate' then null else now() end,
    updated_at = now()
    where id = target_report.id;
end $$;


ALTER FUNCTION "public"."moderate_report"("target_report_id" "uuid", "moderation_action" "text", "moderation_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_deleted_attachment_storage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if old.file_url is not null and nullif(trim(old.file_url), '') is not null then
    insert into public.storage_deletion_queue(
      bucket_id, object_path, reason, requested_by
    ) values (
      'chat-attachments', old.file_url, 'message_deleted', auth.uid()
    ) on conflict do nothing;
  end if;
  return old;
end $$;


ALTER FUNCTION "public"."queue_deleted_attachment_storage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_media_token_issuance"("actor_profile" "uuid", "requested_target_kind" "text", "requested_target_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if actor_profile is null
    or requested_target_kind not in ('server', 'dm')
    or requested_target_id is null
  then
    return false;
  end if;

  if requested_target_kind = 'server' then
    if not exists (
      select 1
      from public.channels ch
      join public.categories c on c.id = ch.category_id
      join public.server_members sm
        on sm.server_id = c.server_id and sm.profile_id = actor_profile
      where ch.id = requested_target_id
        and ch.type = 'voice'
        and not exists (
          select 1 from public.server_bans b
          where b.server_id = c.server_id and b.profile_id = actor_profile
        )
    ) then
      return false;
    end if;
  else
    if not exists (
      select 1
      from public.dm_calls call
      where call.id = requested_target_id
        and actor_profile in (call.caller_id, call.callee_id)
        and call.state = 'accepted'
        and call.expires_at > now()
        and exists (
          select 1 from public.dm_members dm
          where dm.dm_room_id = call.dm_room_id and dm.profile_id = call.caller_id
        )
        and exists (
          select 1 from public.dm_members dm
          where dm.dm_room_id = call.dm_room_id and dm.profile_id = call.callee_id
        )
        and not exists (
          select 1 from public.user_relationships rel
          where (rel.blocker_id = call.caller_id and rel.blocked_id = call.callee_id)
             or (rel.blocker_id = call.callee_id and rel.blocked_id = call.caller_id)
        )
    ) then
      return false;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media-token:' || actor_profile::text, 0));
  delete from public.media_token_issuance
  where created_at < now() - interval '1 day';

  if (
    select count(*) from public.media_token_issuance
    where profile_id = actor_profile
      and created_at >= now() - interval '1 minute'
  ) >= 10 then
    return false;
  end if;

  insert into public.media_token_issuance(profile_id, target_kind, target_id)
  values (actor_profile, requested_target_kind, requested_target_id);

  if requested_target_kind = 'dm' then
    update public.dm_calls
    set expires_at = greatest(expires_at, now() + interval '15 minutes')
    where id = requested_target_id and state = 'accepted';
  end if;

  return true;
end $$;


ALTER FUNCTION "public"."record_media_token_issuance"("actor_profile" "uuid", "requested_target_kind" "text", "requested_target_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_media_token_issuance"("actor_profile" "uuid", "requested_target_kind" "text", "requested_target_id" "uuid") IS 'Service-role-only atomic ten-per-minute media token throttle; actor identity is supplied only after Edge JWT verification.';



CREATE OR REPLACE FUNCTION "public"."respond_to_dm_call"("target_call_id" "uuid", "accept_call" boolean) RETURNS "public"."dm_calls"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  target public.dm_calls;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into target from public.dm_calls where id = target_call_id for update;
  if target.id is null or target.callee_id <> actor then raise exception 'call not found'; end if;
  if target.state <> 'ringing' or target.expires_at <= now() then
    update public.dm_calls
      set state = 'timed_out', ended_at = coalesce(ended_at, now())
      where id = target.id and state = 'ringing';
    raise exception 'call is no longer ringing';
  end if;
  if not exists (
      select 1 from public.dm_members
      where dm_room_id = target.dm_room_id and profile_id = actor
    )
    or not exists (
      select 1 from public.dm_members
      where dm_room_id = target.dm_room_id and profile_id = target.caller_id
    )
    or public.users_blocked(actor, target.caller_id)
  then
    raise exception 'call access denied';
  end if;

  update public.dm_calls set
    state = case when accept_call then 'accepted' else 'declined' end,
    answered_at = case when accept_call then now() else null end,
    ended_at = case when accept_call then null else now() end,
    expires_at = case when accept_call then now() + interval '15 minutes' else expires_at end
  where id = target.id
  returning * into target;
  return target;
end $$;


ALTER FUNCTION "public"."respond_to_dm_call"("target_call_id" "uuid", "accept_call" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_server_invite"("target_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); target_server uuid;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select server_id into target_server from public.invites where id = target_invite_id for update;
  if target_server is null or not public.can_manage_server(target_server) then raise exception 'manager access required'; end if;
  update public.invites set revoked_at = now() where id = target_invite_id;
end $$;


ALTER FUNCTION "public"."revoke_server_invite"("target_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_server_member_role"("target_server_id" "uuid", "target_profile_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication required'; end if;
  if new_role not in ('admin', 'moderator', 'member') then raise exception 'unsupported role'; end if;
  if not exists (select 1 from public.servers where id = target_server_id and owner_id = actor) then raise exception 'owner access required'; end if;
  if target_profile_id = actor then raise exception 'owner role cannot be changed here'; end if;
  update public.server_members set role = new_role
  where server_id = target_server_id and profile_id = target_profile_id and role <> 'owner';
  if not found then raise exception 'member not found or protected'; end if;
end $$;


ALTER FUNCTION "public"."set_server_member_role"("target_server_id" "uuid", "target_profile_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication required'; end if;
  perform 1 from public.servers where id = target_server_id and owner_id = actor for update;
  if not found then raise exception 'owner access required'; end if;
  if new_owner_id is null or new_owner_id = actor then raise exception 'select another member'; end if;
  if not exists (select 1 from public.server_members where server_id = target_server_id and profile_id = new_owner_id) then
    raise exception 'new owner must be a server member';
  end if;
  update public.server_members set role = 'admin'
  where server_id = target_server_id and profile_id = actor;
  update public.server_members set role = 'owner'
  where server_id = target_server_id and profile_id = new_owner_id;
  update public.servers set owner_id = new_owner_id where id = target_server_id;
end $$;


ALTER FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") IS 'Owner-only atomic ownership transfer; browser-supplied identities are targets, never acting identities.';



CREATE OR REPLACE FUNCTION "public"."unban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.can_manage_server(target_server_id) then raise exception 'manager access required'; end if;
  delete from public.server_bans where server_id = target_server_id and profile_id = target_profile_id;
end $$;


ALTER FUNCTION "public"."unban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_channel_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE channels SET last_message_at = NEW.created_at WHERE id = NEW.channel_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_channel_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_server"("target_server_id" "uuid", "new_name" "text", "new_icon_url" "text" DEFAULT NULL::"text") RETURNS "public"."servers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor uuid := auth.uid(); clean_name text := trim(new_name); updated_server public.servers;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if not public.can_manage_server(target_server_id) then raise exception 'manager access required'; end if;
  if char_length(clean_name) not between 1 and 100 then raise exception 'server name must be 1 to 100 characters'; end if;
  if new_icon_url is not null and char_length(new_icon_url) > 2048 then raise exception 'icon URL is too long'; end if;
  update public.servers set name = clean_name, icon_url = new_icon_url where id = target_server_id returning * into updated_server;
  return updated_server;
end $$;


ALTER FUNCTION "public"."update_server"("target_server_id" "uuid", "new_name" "text", "new_icon_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_blocked"("first_user" "uuid", "second_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null
    and auth.uid() in (first_user, second_user)
    and exists (
      select 1 from public.user_relationships
      where (blocker_id = first_user and blocked_id = second_user)
         or (blocker_id = second_user and blocked_id = first_user)
    )
$$;


ALTER FUNCTION "public"."users_blocked"("first_user" "uuid", "second_user" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_reads" (
    "profile_id" "uuid" NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."channel_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "category_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "channels_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'voice'::"text"])))
);


ALTER TABLE "public"."channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_user_id" "uuid",
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "details" "text",
    "client_content" "text",
    "target_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "assigned_to" "uuid",
    "resolution_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "content_reports_client_content_check" CHECK ((("client_content" IS NULL) OR ("char_length"("client_content") <= 10000))),
    CONSTRAINT "content_reports_details_check" CHECK ((("details" IS NULL) OR ("char_length"("details") <= 1000))),
    CONSTRAINT "content_reports_not_self" CHECK ((("reported_user_id" IS NULL) OR ("reported_user_id" <> "reporter_id"))),
    CONSTRAINT "content_reports_reason_check" CHECK (("reason" = ANY (ARRAY['harassment'::"text", 'hate'::"text", 'sexual_content'::"text", 'violence'::"text", 'spam'::"text", 'illegal_activity'::"text", 'privacy'::"text", 'other'::"text"]))),
    CONSTRAINT "content_reports_resolution_note_check" CHECK ((("resolution_note" IS NULL) OR ("char_length"("resolution_note") <= 2000))),
    CONSTRAINT "content_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'actioned'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "content_reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['message'::"text", 'user'::"text", 'server'::"text"])))
);


ALTER TABLE "public"."content_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dm_room_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL
);


ALTER TABLE "public"."dm_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_reads" (
    "profile_id" "uuid" NOT NULL,
    "dm_room_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dm_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "friendships_not_self" CHECK (("sender_id" <> "receiver_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_token_issuance" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "target_kind" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_token_issuance_target_kind_check" CHECK (("target_kind" = ANY (ARRAY['server'::"text", 'dm'::"text"])))
);


ALTER TABLE "public"."media_token_issuance" OWNER TO "postgres";


COMMENT ON TABLE "public"."media_token_issuance" IS 'Service-role-only media token issuance audit used for Edge Function rate limiting.';



ALTER TABLE "public"."media_token_issuance" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."media_token_issuance_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."message_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "file_url" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."message_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_receipts" (
    "message_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "delivered_at" timestamp with time zone,
    "seen_at" timestamp with time zone
);


ALTER TABLE "public"."message_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid",
    "profile_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "dm_room_id" "uuid",
    "is_encrypted" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false,
    "reply_to_message_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_edited" boolean DEFAULT false,
    "is_pinned" boolean DEFAULT false,
    CONSTRAINT "messages_exactly_one_conversation_check" CHECK (((("channel_id" IS NOT NULL) AND ("dm_room_id" IS NULL)) OR (("channel_id" IS NULL) AND ("dm_room_id" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "moderator_id" "uuid" NOT NULL,
    "subject_user_id" "uuid",
    "action" "text" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moderation_actions_action_check" CHECK (("action" = ANY (ARRAY['dismiss'::"text", 'warn'::"text", 'remove_message'::"text", 'restrict_user'::"text", 'suspend_user'::"text", 'escalate'::"text"]))),
    CONSTRAINT "moderation_actions_note_check" CHECK ((("char_length"("note") >= 1) AND ("char_length"("note") <= 2000)))
);


ALTER TABLE "public"."moderation_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderator_roles" (
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moderator_roles_role_check" CHECK (("role" = ANY (ARRAY['moderator'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."moderator_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "theme_color" "text" DEFAULT '#E75480'::"text",
    "unique_tag" "text",
    "bio" "text",
    "pronouns" "text",
    "banner_url" "text",
    "public_key" "text",
    "encrypted_private_key" "text",
    "allow_dms" boolean DEFAULT true,
    "allow_friend_requests" boolean DEFAULT true,
    "fcm_token" "text",
    "terms_version" "text",
    "terms_accepted_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."terms_version" IS 'Version of the Terms of Service accepted by this user.';



COMMENT ON COLUMN "public"."profiles"."terms_accepted_at" IS 'Time at which this user accepted the recorded Terms of Service version.';



CREATE TABLE IF NOT EXISTS "public"."server_bans" (
    "server_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "banned_by" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "server_bans_reason_check" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 500)))
);


ALTER TABLE "public"."server_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_creation_requests" (
    "profile_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."server_creation_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."server_members" (
    "server_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "server_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'moderator'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."server_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storage_deletion_queue" (
    "id" bigint NOT NULL,
    "bucket_id" "text" NOT NULL,
    "object_path" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "last_error" "text",
    CONSTRAINT "storage_deletion_queue_reason_check" CHECK (("reason" = ANY (ARRAY['server_deleted'::"text", 'message_deleted'::"text", 'account_deleted'::"text"])))
);


ALTER TABLE "public"."storage_deletion_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."storage_deletion_queue" IS 'Service-role-only durable cleanup queue. object_path must be normalized by the cleanup worker before Storage deletion.';



ALTER TABLE "public"."storage_deletion_queue" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."storage_deletion_queue_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_relationships" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "user_relationships_not_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_server_id_name_key" UNIQUE ("server_id", "name");



ALTER TABLE ONLY "public"."channel_reads"
    ADD CONSTRAINT "channel_reads_pkey" PRIMARY KEY ("profile_id", "channel_id");



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_calls"
    ADD CONSTRAINT "dm_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_dm_room_id_profile_id_key" UNIQUE ("dm_room_id", "profile_id");



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_pkey" PRIMARY KEY ("profile_id", "dm_room_id");



ALTER TABLE ONLY "public"."dm_rooms"
    ADD CONSTRAINT "dm_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_sender_id_receiver_id_key" UNIQUE ("sender_id", "receiver_id");



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_token_issuance"
    ADD CONSTRAINT "media_token_issuance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_profile_id_emoji_key" UNIQUE ("message_id", "profile_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_profile_unique" UNIQUE ("message_id", "profile_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("message_id", "profile_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderator_roles"
    ADD CONSTRAINT "moderator_roles_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_unique_tag_key" UNIQUE ("unique_tag");



ALTER TABLE ONLY "public"."server_bans"
    ADD CONSTRAINT "server_bans_pkey" PRIMARY KEY ("server_id", "profile_id");



ALTER TABLE ONLY "public"."server_creation_requests"
    ADD CONSTRAINT "server_creation_requests_pkey" PRIMARY KEY ("profile_id", "request_id");



ALTER TABLE ONLY "public"."server_creation_requests"
    ADD CONSTRAINT "server_creation_requests_server_id_key" UNIQUE ("server_id");



ALTER TABLE ONLY "public"."server_members"
    ADD CONSTRAINT "server_members_pkey" PRIMARY KEY ("server_id", "profile_id");



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_deletion_queue"
    ADD CONSTRAINT "storage_deletion_queue_bucket_id_object_path_reason_key" UNIQUE ("bucket_id", "object_path", "reason");



ALTER TABLE ONLY "public"."storage_deletion_queue"
    ADD CONSTRAINT "storage_deletion_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_relationships"
    ADD CONSTRAINT "user_relationships_blocker_id_blocked_id_key" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."user_relationships"
    ADD CONSTRAINT "user_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "categories_server_id_position_idx" ON "public"."categories" USING "btree" ("server_id", "position");



CREATE INDEX "channels_category_id_idx" ON "public"."channels" USING "btree" ("category_id");



CREATE UNIQUE INDEX "content_reports_open_dedupe_idx" ON "public"."content_reports" USING "btree" ("reporter_id", "target_type", "target_id", "reason") WHERE ("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text"]));



CREATE INDEX "content_reports_reporter_idx" ON "public"."content_reports" USING "btree" ("reporter_id", "created_at");



CREATE INDEX "content_reports_status_created_idx" ON "public"."content_reports" USING "btree" ("status", "created_at");



CREATE INDEX "dm_calls_callee_active_idx" ON "public"."dm_calls" USING "btree" ("callee_id", "created_at" DESC) WHERE ("state" = ANY (ARRAY['ringing'::"text", 'accepted'::"text"]));



CREATE INDEX "dm_calls_callee_ringing_idx" ON "public"."dm_calls" USING "btree" ("callee_id", "created_at" DESC) WHERE ("state" = 'ringing'::"text");



CREATE INDEX "dm_calls_caller_active_idx" ON "public"."dm_calls" USING "btree" ("caller_id", "created_at" DESC) WHERE ("state" = ANY (ARRAY['ringing'::"text", 'accepted'::"text"]));



CREATE INDEX "dm_calls_room_created_idx" ON "public"."dm_calls" USING "btree" ("dm_room_id", "created_at" DESC);



CREATE UNIQUE INDEX "dm_members_one_per_room_user_idx" ON "public"."dm_members" USING "btree" ("dm_room_id", "profile_id");



CREATE UNIQUE INDEX "friendships_one_pair_idx" ON "public"."friendships" USING "btree" (LEAST("sender_id", "receiver_id"), GREATEST("sender_id", "receiver_id"));



CREATE INDEX "idx_friendships_users" ON "public"."friendships" USING "btree" ("sender_id", "receiver_id");



CREATE INDEX "idx_messages_channel" ON "public"."messages" USING "btree" ("channel_id", "created_at" DESC);



CREATE INDEX "idx_messages_channel_id" ON "public"."messages" USING "btree" ("channel_id");



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_dm_room" ON "public"."messages" USING "btree" ("dm_room_id", "created_at" DESC);



CREATE INDEX "idx_messages_is_edited" ON "public"."messages" USING "btree" ("is_edited");



CREATE INDEX "idx_server_members_profile_id" ON "public"."server_members" USING "btree" ("profile_id");



CREATE INDEX "idx_server_members_server_id" ON "public"."server_members" USING "btree" ("server_id");



CREATE INDEX "idx_user_settings_user_id" ON "public"."user_settings" USING "btree" ("user_id");



CREATE UNIQUE INDEX "invites_code_unique_idx" ON "public"."invites" USING "btree" ("upper"("code"));



CREATE INDEX "invites_server_active_idx" ON "public"."invites" USING "btree" ("server_id", "revoked_at", "expires_at");



CREATE INDEX "media_token_issuance_rate_idx" ON "public"."media_token_issuance" USING "btree" ("profile_id", "created_at" DESC);



CREATE UNIQUE INDEX "message_reactions_one_per_user_idx" ON "public"."message_reactions" USING "btree" ("message_id", "profile_id");



CREATE INDEX "server_members_profile_server_idx" ON "public"."server_members" USING "btree" ("profile_id", "server_id");



CREATE UNIQUE INDEX "user_relationships_unique_pair_idx" ON "public"."user_relationships" USING "btree" ("blocker_id", "blocked_id");



CREATE OR REPLACE TRIGGER "channels_same_server_guard" BEFORE UPDATE ON "public"."channels" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_channel_server_on_move"();



CREATE OR REPLACE TRIGGER "content_reports_capture_snapshot" BEFORE INSERT ON "public"."content_reports" FOR EACH ROW EXECUTE FUNCTION "public"."capture_report_snapshot"();



CREATE OR REPLACE TRIGGER "handle_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "message_attachments_queue_storage_delete" AFTER DELETE ON "public"."message_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."queue_deleted_attachment_storage"();



CREATE OR REPLACE TRIGGER "messages_integrity_guard" BEFORE INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_message_integrity"();



CREATE OR REPLACE TRIGGER "trigger_update_channel_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN (("new"."channel_id" IS NOT NULL)) EXECUTE FUNCTION "public"."update_channel_last_message"();



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_reads"
    ADD CONSTRAINT "channel_reads_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_reads"
    ADD CONSTRAINT "channel_reads_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channels"
    ADD CONSTRAINT "channels_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_reports"
    ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_calls"
    ADD CONSTRAINT "dm_calls_callee_id_fkey" FOREIGN KEY ("callee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_calls"
    ADD CONSTRAINT "dm_calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_calls"
    ADD CONSTRAINT "dm_calls_dm_room_id_fkey" FOREIGN KEY ("dm_room_id") REFERENCES "public"."dm_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_dm_room_id_fkey" FOREIGN KEY ("dm_room_id") REFERENCES "public"."dm_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_members"
    ADD CONSTRAINT "dm_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_dm_room_id_fkey" FOREIGN KEY ("dm_room_id") REFERENCES "public"."dm_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_reads"
    ADD CONSTRAINT "dm_reads_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "fk_messages_profile" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "fk_receiver" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "fk_sender" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invites"
    ADD CONSTRAINT "invites_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_token_issuance"
    ADD CONSTRAINT "media_token_issuance_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_attachments"
    ADD CONSTRAINT "message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_dm_room_id_fkey" FOREIGN KEY ("dm_room_id") REFERENCES "public"."dm_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."content_reports"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderator_roles"
    ADD CONSTRAINT "moderator_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_bans"
    ADD CONSTRAINT "server_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."server_bans"
    ADD CONSTRAINT "server_bans_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_bans"
    ADD CONSTRAINT "server_bans_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_creation_requests"
    ADD CONSTRAINT "server_creation_requests_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_creation_requests"
    ADD CONSTRAINT "server_creation_requests_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_members"
    ADD CONSTRAINT "server_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."server_members"
    ADD CONSTRAINT "server_members_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."storage_deletion_queue"
    ADD CONSTRAINT "storage_deletion_queue_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_relationships"
    ADD CONSTRAINT "user_relationships_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_relationships"
    ADD CONSTRAINT "user_relationships_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow users to add dm members" ON "public"."dm_members" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow users to create dm rooms" ON "public"."dm_rooms" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow users to insert their own messages" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Allow users to see dm members" ON "public"."dm_members" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow users to see dm rooms" ON "public"."dm_rooms" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow users to update dm_rooms" ON "public"."dm_rooms" FOR UPDATE USING (true);



CREATE POLICY "Allow users to view all messages" ON "public"."messages" FOR SELECT USING (true);



CREATE POLICY "Anyone can read active invites" ON "public"."invites" FOR SELECT USING (("uses_left" > 0));



CREATE POLICY "Anyone can use invite codes" ON "public"."invites" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable all for authenticated users" ON "public"."invites" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."server_members" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."servers" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Enable read access for all users" ON "public"."server_members" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."servers" FOR SELECT USING (true);



CREATE POLICY "Only owners can delete their servers" ON "public"."servers" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Only owners can update their servers" ON "public"."servers" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owners can manage servers" ON "public"."servers" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Public profiles are searchable" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Reactions are viewable by everyone" ON "public"."message_reactions" FOR SELECT USING (true);



CREATE POLICY "Secure invite updates" ON "public"."invites" FOR UPDATE USING (("uses_left" > 0));



CREATE POLICY "Users can accept their received requests" ON "public"."friendships" FOR UPDATE USING (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Users can create friend requests" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can create servers" ON "public"."servers" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own profile" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can delete requests" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Users can delete their own DM rooms" ON "public"."dm_rooms" FOR DELETE USING (("id" IN ( SELECT "dm_members"."dm_room_id"
   FROM "public"."dm_members"
  WHERE ("dm_members"."profile_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete their own reactions" ON "public"."message_reactions" FOR DELETE USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can insert dm_rooms" ON "public"."dm_rooms" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own reactions" ON "public"."message_reactions" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can insert/update their own reads" ON "public"."channel_reads" TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "Users can join servers" ON "public"."server_members" FOR INSERT WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can manage their own blocks" ON "public"."user_relationships" USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "Users can manage their own settings" ON "public"."user_settings" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can see their own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own dm_rooms" ON "public"."dm_rooms" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_room_id" = "dm_rooms"."id") AND ("dm_members"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Users can view servers they are in" ON "public"."servers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "servers"."id") AND ("server_members"."profile_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own dm_rooms" ON "public"."dm_rooms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_room_id" = "dm_rooms"."id") AND ("dm_members"."profile_id" = "auth"."uid"())))));



CREATE POLICY "attachments_read_message" ON "public"."message_attachments" FOR SELECT TO "authenticated" USING ("public"."can_access_message"("message_id"));



CREATE POLICY "attachments_write_message_owner" ON "public"."message_attachments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_attachments"."message_id") AND ("m"."profile_id" = "auth"."uid"())))));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_all_access" ON "public"."categories" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "categories_manage_admin" ON "public"."categories" TO "authenticated" USING ("public"."can_manage_server"("server_id")) WITH CHECK ("public"."can_manage_server"("server_id"));



CREATE POLICY "categories_read_member" ON "public"."categories" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



ALTER TABLE "public"."channel_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channel_reads_all_self" ON "public"."channel_reads" TO "authenticated" USING ((("profile_id" = "auth"."uid"()) AND "public"."is_channel_member"("channel_id"))) WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."is_channel_member"("channel_id")));



CREATE POLICY "channel_reads_self" ON "public"."channel_reads" TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK ((("profile_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."channels" "ch"
     JOIN "public"."categories" "cat" ON (("cat"."id" = "ch"."category_id")))
  WHERE (("ch"."id" = "channel_reads"."channel_id") AND "public"."is_server_member"("cat"."server_id"))))));



ALTER TABLE "public"."channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "channels_delete_admin" ON "public"."channels" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "channels"."category_id") AND "public"."can_manage_server"("c"."server_id")))));



CREATE POLICY "channels_insert_admin" ON "public"."channels" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "channels"."category_id") AND "public"."can_manage_server"("c"."server_id")))));



CREATE POLICY "channels_read_member" ON "public"."channels" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "channels"."category_id") AND "public"."is_server_member"("c"."server_id")))));



CREATE POLICY "channels_update_admin" ON "public"."channels" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "channels"."category_id") AND "public"."can_manage_server"("c"."server_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "channels"."category_id") AND "public"."can_manage_server"("c"."server_id")))));



ALTER TABLE "public"."content_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm reads select members" ON "public"."dm_reads" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."dm_members"
  WHERE (("dm_members"."dm_room_id" = "dm_reads"."dm_room_id") AND ("dm_members"."profile_id" = "auth"."uid"())))));



CREATE POLICY "dm reads update own" ON "public"."dm_reads" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "dm reads upsert own" ON "public"."dm_reads" FOR INSERT TO "authenticated" WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."dm_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_calls_read_party" ON "public"."dm_calls" FOR SELECT TO "authenticated" USING ((("caller_id" = "auth"."uid"()) OR ("callee_id" = "auth"."uid"())));



ALTER TABLE "public"."dm_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_members_add_self_or_peer" ON "public"."dm_members" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) OR ("public"."is_dm_member"("dm_room_id") AND (NOT "public"."users_blocked"("auth"."uid"(), "profile_id")) AND COALESCE(( SELECT "profiles"."allow_dms"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "dm_members"."profile_id")), true))));



CREATE POLICY "dm_members_delete_self" ON "public"."dm_members" FOR DELETE TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "dm_members_leave" ON "public"."dm_members" FOR DELETE TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "dm_members_read_member" ON "public"."dm_members" FOR SELECT TO "authenticated" USING ("public"."is_dm_member"("dm_room_id"));



ALTER TABLE "public"."dm_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_reads_participant" ON "public"."dm_reads" FOR SELECT TO "authenticated" USING ("public"."is_dm_member"("dm_room_id"));



CREATE POLICY "dm_reads_self_update" ON "public"."dm_reads" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."is_dm_member"("dm_room_id")));



CREATE POLICY "dm_reads_self_write" ON "public"."dm_reads" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."is_dm_member"("dm_room_id")));



ALTER TABLE "public"."dm_rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dm_rooms_create_authenticated" ON "public"."dm_rooms" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "dm_rooms_insert_auth" ON "public"."dm_rooms" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "dm_rooms_read_member" ON "public"."dm_rooms" FOR SELECT TO "authenticated" USING ("public"."is_dm_member"("id"));



CREATE POLICY "dm_rooms_update_member" ON "public"."dm_rooms" FOR UPDATE TO "authenticated" USING ("public"."is_dm_member"("id")) WITH CHECK ("public"."is_dm_member"("id"));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_accept_receiver" ON "public"."friendships" FOR UPDATE TO "authenticated" USING (("receiver_id" = "auth"."uid"())) WITH CHECK ((("receiver_id" = "auth"."uid"()) AND ("status" = 'accepted'::"text")));



CREATE POLICY "friendships_delete_participant" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friendships_delete_party" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friendships_insert_self" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("receiver_id" <> "auth"."uid"())));



CREATE POLICY "friendships_read_party" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friendships_request_self" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("receiver_id" <> "auth"."uid"()) AND (NOT "public"."users_blocked"("sender_id", "receiver_id")) AND COALESCE(( SELECT "profiles"."allow_friend_requests"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "friendships"."receiver_id")), true)));



CREATE POLICY "friendships_select_participant" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



CREATE POLICY "friendships_update_receiver_or_sender" ON "public"."friendships" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()))) WITH CHECK ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));



ALTER TABLE "public"."invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invites_delete_manager" ON "public"."invites" FOR DELETE TO "authenticated" USING ("public"."can_manage_server"("server_id"));



CREATE POLICY "invites_delete_mod" ON "public"."invites" FOR DELETE TO "authenticated" USING ("public"."is_server_moderator"("server_id"));



CREATE POLICY "invites_insert_mod" ON "public"."invites" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."is_server_moderator"("server_id")));



CREATE POLICY "invites_read_manager" ON "public"."invites" FOR SELECT TO "authenticated" USING ("public"."can_manage_server"("server_id"));



CREATE POLICY "invites_update_manager" ON "public"."invites" FOR UPDATE TO "authenticated" USING ("public"."can_manage_server"("server_id")) WITH CHECK ("public"."can_manage_server"("server_id"));



CREATE POLICY "invites_update_mod" ON "public"."invites" FOR UPDATE TO "authenticated" USING ("public"."is_server_moderator"("server_id")) WITH CHECK ("public"."is_server_moderator"("server_id"));



ALTER TABLE "public"."media_token_issuance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_attachments_delete_message_owner" ON "public"."message_attachments" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."messages"
  WHERE (("messages"."id" = "message_attachments"."message_id") AND ("messages"."profile_id" = "auth"."uid"())))));



CREATE POLICY "message_attachments_insert_message_owner" ON "public"."message_attachments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."messages"
  WHERE (("messages"."id" = "message_attachments"."message_id") AND ("messages"."profile_id" = "auth"."uid"())))));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reactions_delete_self" ON "public"."message_reactions" FOR DELETE TO "authenticated" USING (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."message_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_delete_owner_or_moderator" ON "public"."messages" FOR DELETE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_moderator"()));



CREATE POLICY "messages_insert_authorized" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."terms_version" = '2026-07-12'::"text") AND ("p"."terms_accepted_at" IS NOT NULL)))) AND ((("dm_room_id" IS NOT NULL) AND "public"."is_dm_member"("dm_room_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."dm_members" "peer"
  WHERE (("peer"."dm_room_id" = "messages"."dm_room_id") AND ("peer"."profile_id" <> "auth"."uid"()) AND "public"."users_blocked"("auth"."uid"(), "peer"."profile_id")))))) OR (("channel_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."channels" "ch"
     JOIN "public"."categories" "cat" ON (("cat"."id" = "ch"."category_id")))
  WHERE (("ch"."id" = "messages"."channel_id") AND "public"."is_server_member"("cat"."server_id"))))))));



CREATE POLICY "messages_read_participant" ON "public"."messages" FOR SELECT TO "authenticated" USING ("public"."can_access_message"("id"));



CREATE POLICY "messages_update_owner" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



ALTER TABLE "public"."moderation_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moderation_actions_insert_moderator" ON "public"."moderation_actions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_moderator"() AND ("moderator_id" = "auth"."uid"())));



CREATE POLICY "moderation_actions_moderator" ON "public"."moderation_actions" FOR SELECT TO "authenticated" USING ("public"."is_moderator"());



ALTER TABLE "public"."moderator_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moderator_roles_read_self_or_moderator" ON "public"."moderator_roles" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_moderator"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_read_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_select_related" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."dm_members" "mine"
     JOIN "public"."dm_members" "theirs" ON (("theirs"."dm_room_id" = "mine"."dm_room_id")))
  WHERE (("mine"."profile_id" = "auth"."uid"()) AND ("theirs"."profile_id" = "profiles"."id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."server_members" "mine"
     JOIN "public"."server_members" "theirs" ON (("theirs"."server_id" = "mine"."server_id")))
  WHERE (("mine"."profile_id" = "auth"."uid"()) AND ("theirs"."profile_id" = "profiles"."id")))) OR (EXISTS ( SELECT 1
   FROM "public"."friendships"
  WHERE (("friendships"."status" = 'accepted'::"text") AND ((("friendships"."sender_id" = "auth"."uid"()) AND ("friendships"."receiver_id" = "profiles"."id")) OR (("friendships"."receiver_id" = "auth"."uid"()) AND ("friendships"."sender_id" = "profiles"."id"))))))));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "reactions_delete_self" ON "public"."message_reactions" FOR DELETE TO "authenticated" USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "reactions_read_message" ON "public"."message_reactions" FOR SELECT TO "authenticated" USING ("public"."can_access_message"("message_id"));



CREATE POLICY "reactions_write_self" ON "public"."message_reactions" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."can_access_message"("message_id")));



CREATE POLICY "receipts_message_participant" ON "public"."message_receipts" FOR SELECT TO "authenticated" USING ("public"."can_access_message"("message_id"));



CREATE POLICY "receipts_self_update" ON "public"."message_receipts" FOR UPDATE TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "receipts_self_write" ON "public"."message_receipts" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."can_access_message"("message_id")));



CREATE POLICY "relationships_block_self" ON "public"."user_relationships" FOR INSERT TO "authenticated" WITH CHECK ((("blocker_id" = "auth"."uid"()) AND ("blocked_id" <> "auth"."uid"())));



CREATE POLICY "relationships_read_party" ON "public"."user_relationships" FOR SELECT TO "authenticated" USING ((("blocker_id" = "auth"."uid"()) OR ("blocked_id" = "auth"."uid"())));



CREATE POLICY "relationships_unblock_self" ON "public"."user_relationships" FOR DELETE TO "authenticated" USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "reports_insert_visible_target" ON "public"."content_reports" FOR INSERT TO "authenticated" WITH CHECK ((("reporter_id" = "auth"."uid"()) AND ("reported_user_id" <> "auth"."uid"()) AND ((("target_type" = 'message'::"text") AND "public"."can_access_message"("target_id", "auth"."uid"())) OR ("target_type" = 'user'::"text") OR (("target_type" = 'server'::"text") AND "public"."is_server_member"("target_id")))));



CREATE POLICY "reports_read_reporter_or_moderator" ON "public"."content_reports" FOR SELECT TO "authenticated" USING ((("reporter_id" = "auth"."uid"()) OR "public"."is_moderator"()));



CREATE POLICY "reports_update_moderator" ON "public"."content_reports" FOR UPDATE TO "authenticated" USING ("public"."is_moderator"()) WITH CHECK ("public"."is_moderator"());



ALTER TABLE "public"."server_bans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "server_bans_read_manager" ON "public"."server_bans" FOR SELECT TO "authenticated" USING ("public"."can_manage_server"("server_id"));



ALTER TABLE "public"."server_creation_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."server_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "server_members_delete_self_or_mod" ON "public"."server_members" FOR DELETE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."is_server_moderator"("server_id")));



CREATE POLICY "server_members_insert" ON "public"."server_members" FOR INSERT WITH CHECK ((("auth"."uid"() IN ( SELECT "servers"."owner_id"
   FROM "public"."servers"
  WHERE ("servers"."id" = "server_members"."server_id"))) OR ("auth"."uid"() = "profile_id")));



CREATE POLICY "server_members_insert_self_or_mod" ON "public"."server_members" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" = "auth"."uid"()) OR "public"."is_server_moderator"("server_id")));



CREATE POLICY "server_members_read_member" ON "public"."server_members" FOR SELECT TO "authenticated" USING ("public"."is_server_member"("server_id"));



CREATE POLICY "server_members_select" ON "public"."server_members" FOR SELECT USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "server_members_update_mod" ON "public"."server_members" FOR UPDATE TO "authenticated" USING ("public"."is_server_moderator"("server_id")) WITH CHECK ("public"."is_server_moderator"("server_id"));



ALTER TABLE "public"."servers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "servers_all_access" ON "public"."servers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "servers_create_owner" ON "public"."servers" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "servers_delete" ON "public"."servers" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "servers_delete_owner" ON "public"."servers" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "servers_insert" ON "public"."servers" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "servers_insert_self_owner" ON "public"."servers" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "servers_manage_owner" ON "public"."servers" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "servers_read_member" ON "public"."servers" FOR SELECT TO "authenticated" USING (("public"."is_server_member"("id") OR ("owner_id" = "auth"."uid"())));



CREATE POLICY "servers_select" ON "public"."servers" FOR SELECT USING (("id" IN ( SELECT "server_members"."server_id"
   FROM "public"."server_members"
  WHERE ("server_members"."profile_id" = "auth"."uid"()))));



CREATE POLICY "servers_update" ON "public"."servers" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "servers_update_owner_or_mod" ON "public"."servers" FOR UPDATE TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."is_server_moderator"("id"))) WITH CHECK ((("owner_id" = "auth"."uid"()) OR "public"."is_server_moderator"("id")));



ALTER TABLE "public"."storage_deletion_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_relationships_all_self" ON "public"."user_relationships" TO "authenticated" USING (("blocker_id" = "auth"."uid"())) WITH CHECK ((("blocker_id" = "auth"."uid"()) AND ("blocked_id" <> "auth"."uid"())));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_all_self" ON "public"."user_settings" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_delete_self" ON "public"."user_settings" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_insert_self" ON "public"."user_settings" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_read_self" ON "public"."user_settings" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_settings_update_self" ON "public"."user_settings" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."ban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid", "ban_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid", "ban_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid", "ban_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_message"("target_message_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_message"("target_message_id" "uuid", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_message"("target_message_id" "uuid", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_server"("target_server_id" "uuid", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_server"("target_server_id" "uuid", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_server"("target_server_id" "uuid", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_report_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_report_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_report_snapshot"() TO "service_role";



GRANT ALL ON TABLE "public"."dm_calls" TO "service_role";
GRANT SELECT ON TABLE "public"."dm_calls" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_dm_call"("target_room_id" "uuid", "requested_kind" "text") TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."dm_rooms" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."dm_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_rooms" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_or_get_dm"("peer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_get_dm"("peer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_get_dm"("peer_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."servers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."servers" TO "authenticated";
GRANT ALL ON TABLE "public"."servers" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_server"("server_name" "text", "idempotency_key" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invites" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invites" TO "authenticated";
GRANT ALL ON TABLE "public"."invites" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_server_invite"("target_server_id" "uuid", "requested_uses" integer, "requested_expires_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_server_invite"("target_server_id" "uuid", "requested_uses" integer, "requested_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_server_invite"("target_server_id" "uuid", "requested_uses" integer, "requested_expires_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_server"("target_server_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_server"("target_server_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_server"("target_server_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_user_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_dm_call"("target_call_id" "uuid", "final_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_dm_call"("target_call_id" "uuid", "final_state" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_dm_call"("target_call_id" "uuid", "final_state" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_channel_server_on_move"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_channel_server_on_move"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_channel_server_on_move"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_message_integrity"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_message_integrity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_message_integrity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_dm_room"("other_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_channel_member"("target_channel_id" "uuid", "target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_channel_member"("target_channel_id" "uuid", "target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_channel_member"("target_channel_id" "uuid", "target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_dm_member"("target_room_id" "uuid", "user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_dm_member"("target_room_id" "uuid", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dm_member"("target_room_id" "uuid", "user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_moderator"("user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_moderator"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_server_member"("target_server_id" "uuid", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_server_member"("target_server_id" "uuid", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_server_member"("target_server_id" "uuid", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_server_moderator"("target_server_id" "uuid", "target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_server_moderator"("target_server_id" "uuid", "target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_server_moderator"("target_server_id" "uuid", "target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_server_by_code"("invite" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_server_by_code"("invite" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_server_by_code"("invite" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_server"("target_server_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_server"("target_server_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_server"("target_server_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_report"("target_report_id" "uuid", "moderation_action" "text", "moderation_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_report"("target_report_id" "uuid", "moderation_action" "text", "moderation_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderate_report"("target_report_id" "uuid", "moderation_action" "text", "moderation_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_deleted_attachment_storage"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_deleted_attachment_storage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_deleted_attachment_storage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_media_token_issuance"("actor_profile" "uuid", "requested_target_kind" "text", "requested_target_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_media_token_issuance"("actor_profile" "uuid", "requested_target_kind" "text", "requested_target_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_to_dm_call"("target_call_id" "uuid", "accept_call" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_to_dm_call"("target_call_id" "uuid", "accept_call" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."respond_to_dm_call"("target_call_id" "uuid", "accept_call" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_server_invite"("target_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_server_invite"("target_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_server_invite"("target_invite_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_server_member_role"("target_server_id" "uuid", "target_profile_id" "uuid", "new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_server_member_role"("target_server_id" "uuid", "target_profile_id" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_server_member_role"("target_server_id" "uuid", "target_profile_id" "uuid", "new_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_server_ownership"("target_server_id" "uuid", "new_owner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unban_server_member"("target_server_id" "uuid", "target_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_channel_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_channel_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_channel_last_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_server"("target_server_id" "uuid", "new_name" "text", "new_icon_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_server"("target_server_id" "uuid", "new_name" "text", "new_icon_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_server"("target_server_id" "uuid", "new_name" "text", "new_icon_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."users_blocked"("first_user" "uuid", "second_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."users_blocked"("first_user" "uuid", "second_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_blocked"("first_user" "uuid", "second_user" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."channel_reads" TO "anon";
GRANT ALL ON TABLE "public"."channel_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_reads" TO "service_role";



GRANT ALL ON TABLE "public"."channels" TO "anon";
GRANT ALL ON TABLE "public"."channels" TO "authenticated";
GRANT ALL ON TABLE "public"."channels" TO "service_role";



GRANT ALL ON TABLE "public"."content_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."content_reports" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."dm_members" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."dm_members" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_members" TO "service_role";



GRANT ALL ON TABLE "public"."dm_reads" TO "anon";
GRANT ALL ON TABLE "public"."dm_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_reads" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."media_token_issuance" TO "service_role";



GRANT ALL ON SEQUENCE "public"."media_token_issuance_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."media_token_issuance_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."media_token_issuance_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."message_attachments" TO "anon";
GRANT ALL ON TABLE "public"."message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."message_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."message_receipts" TO "anon";
GRANT ALL ON TABLE "public"."message_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."message_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."moderation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_actions" TO "service_role";



GRANT ALL ON TABLE "public"."moderator_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."moderator_roles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("username") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("username") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("unique_tag") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("unique_tag") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."server_bans" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."server_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."server_bans" TO "service_role";



GRANT ALL ON TABLE "public"."server_creation_requests" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."server_members" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."server_members" TO "authenticated";
GRANT ALL ON TABLE "public"."server_members" TO "service_role";



GRANT ALL ON TABLE "public"."storage_deletion_queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."storage_deletion_queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."storage_deletion_queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."storage_deletion_queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_relationships" TO "anon";
GRANT ALL ON TABLE "public"."user_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."user_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
