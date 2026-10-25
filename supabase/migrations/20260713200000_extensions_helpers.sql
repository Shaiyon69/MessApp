create schema if not exists extensions;

create or replace function extensions.messapp_random_bytes(byte_count integer)
returns bytea
language sql
set search_path = public, extensions, pg_temp
as $$ select gen_random_bytes(byte_count) $$;

alter function extensions.messapp_random_bytes(integer) owner to postgres;
