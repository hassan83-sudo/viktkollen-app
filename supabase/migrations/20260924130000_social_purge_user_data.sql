-- Account-deletion social purge, policy C.
-- Function only. Does not create or alter social tables.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.social_purge_user_data(p_user_id uuid)
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

  delete from public.social_messages
  where sender_id = p_user_id;

  delete from public.social_conversation_members
  where user_id = p_user_id;

  delete from public.social_dm_pairs
  where user_low = p_user_id
     or user_high = p_user_id;

  delete from public.social_location_envelopes
  where owner_user_id = p_user_id
     or recipient_user_id = p_user_id;

  delete from public.social_locations
  where user_id = p_user_id;

  delete from public.social_friend_requests
  where from_user_id = p_user_id
     or to_user_id = p_user_id;

  delete from public.social_friendships
  where user_low = p_user_id
     or user_high = p_user_id;

  delete from public.social_blocks
  where blocker_id = p_user_id
     or blocked_id = p_user_id;

  delete from public.social_public_profiles
  where user_id = p_user_id;
end;
$$;

revoke all on function public.social_purge_user_data(uuid) from public;
revoke all on function public.social_purge_user_data(uuid) from anon;
revoke all on function public.social_purge_user_data(uuid) from authenticated;
grant execute on function public.social_purge_user_data(uuid) to service_role;

comment on function public.social_purge_user_data(uuid) is
  'Account purge policy C: removes the departing user''s social rows and DM index. Keeps the conversation, the other participant''s messages and membership, and the shared conversation key.';
