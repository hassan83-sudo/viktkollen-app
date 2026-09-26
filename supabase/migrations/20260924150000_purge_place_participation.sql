-- Account-deletion place-participation purge.
-- Function only. Does not delete envelopes, keys, family rows, or call rows.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_place_participation(p_user_id uuid)
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

  delete from public.place_location_shares
  where user_id = p_user_id;

  delete from public.place_e2ee_live_locations
  where owner_user_id = p_user_id
     or recipient_user_id = p_user_id;

  delete from public.place_voice_call_signals
  where sender_user_id = p_user_id;
end;
$$;

revoke all on function public.purge_place_participation(uuid) from public;
revoke all on function public.purge_place_participation(uuid) from anon;
revoke all on function public.purge_place_participation(uuid) from authenticated;
grant execute on function public.purge_place_participation(uuid) to service_role;

comment on function public.purge_place_participation(uuid) is
  'Deletes one verified user''s own location-share row, live-location copies, and voice-call signals. Does not delete envelopes or keys.';
