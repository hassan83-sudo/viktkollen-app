-- Account-deletion atomic database cleanup.
-- Function only. Calls the existing purge functions and deletes the
-- sync and backup rows in one transaction.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_account_user_data(p_user_id uuid)
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

  perform public.purge_family_membership(p_user_id);
  perform public.social_purge_user_data(p_user_id);

  delete from public.user_sync_items
  where user_id = p_user_id;

  delete from public.user_sync_events
  where user_id = p_user_id;

  delete from public.user_sync_state
  where user_id = p_user_id;

  delete from public.user_backups
  where user_id = p_user_id;

  perform public.purge_exclusive_user_data(p_user_id);
  perform public.purge_place_participation(p_user_id);
end;
$$;

revoke all on function public.purge_account_user_data(uuid) from public;
revoke all on function public.purge_account_user_data(uuid) from anon;
revoke all on function public.purge_account_user_data(uuid) from authenticated;
grant execute on function public.purge_account_user_data(uuid) to service_role;

comment on function public.purge_account_user_data(uuid) is
  'Deletes one verified user''s account data in one database transaction. An error from any step rolls the whole call back.';
