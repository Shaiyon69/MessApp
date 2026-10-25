create or replace function public.leave_server(target_server_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  membership_role text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select role into membership_role from public.server_members
  where server_id = target_server_id and profile_id = actor for update;
  if membership_role is null then return; end if;
  if membership_role = 'owner' then raise exception 'transfer ownership or delete the server before leaving'; end if;
  delete from public.server_members where server_id = target_server_id and profile_id = actor;
end $$;

alter function public.leave_server(uuid) owner to postgres;
revoke all on function public.leave_server(uuid) from public, anon;
grant execute on function public.leave_server(uuid) to authenticated, service_role;
