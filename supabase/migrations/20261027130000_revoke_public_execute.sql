-- anon kept EXECUTE on these through the PUBLIC grant, which the hardening
-- migration's "revoke ... from anon" does not touch. authenticated and
-- service_role keep their explicit grants.
revoke execute on function public.can_manage_server(uuid, uuid) from public;
revoke execute on function public.delete_user_account() from public;
revoke execute on function public.is_server_member(uuid, uuid) from public;
revoke execute on function public.is_server_moderator(uuid, uuid) from public;

-- Stop new functions picking up a PUBLIC grant; Supabase's default privileges
-- still grant authenticated and service_role explicitly.
alter default privileges in schema public revoke execute on functions from public;
