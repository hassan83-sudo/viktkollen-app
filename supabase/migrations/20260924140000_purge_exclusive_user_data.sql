-- Account-deletion exclusive-row purge.
-- Function only. Does not create or alter tables and does not change
-- private.delete_user_backup_secret.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_exclusive_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  delete from public.reminder_push_schedules
  where user_id = p_user_id;

  delete from public.place_push_subscriptions
  where user_id = p_user_id;

  delete from public.place_location_history
  where user_id = p_user_id;

  delete from public.place_location_history_settings
  where user_id = p_user_id;

  delete from private.user_backup_keys
  where user_id = p_user_id;
end;
$$;

revoke all on function public.purge_exclusive_user_data(uuid) from public;
revoke all on function public.purge_exclusive_user_data(uuid) from anon;
revoke all on function public.purge_exclusive_user_data(uuid) from authenticated;
grant execute on function public.purge_exclusive_user_data(uuid) to service_role;

comment on function public.purge_exclusive_user_data(uuid) is
  'Deletes one verified user''s exclusive reminder, push, location-history, and backup-key rows. The existing backup-key trigger removes that row''s Vault secret.';
