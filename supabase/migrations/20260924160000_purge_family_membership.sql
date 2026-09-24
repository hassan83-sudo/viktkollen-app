-- Account-deletion family-membership purge.
-- Function only. Transfers place_families.created_by to a remaining
-- guardian, then deletes only the departing user's membership.
-- Local migration only. DO NOT apply to production until reviewed.

create or replace function public.purge_family_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_family_id uuid;
  v_created_by uuid;
  v_successor uuid;
  v_verified_created_by uuid;
  v_successor_still_member boolean;
begin
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if auth.role() is distinct from 'service_role' then
    raise exception 'not allowed';
  end if;

  for v_family_id in
    select m.family_id
    from public.place_family_members m
    where m.user_id = p_user_id
    order by m.family_id asc
  loop
    select f.created_by
      into v_created_by
    from public.place_families f
    where f.id = v_family_id
    for update;

    if not found then
      raise exception 'family missing';
    end if;

    perform 1
    from public.place_family_members m
    where m.family_id = v_family_id
    order by m.user_id asc
    for update;

    if v_created_by = p_user_id then
      select m.user_id
        into v_successor
      from public.place_family_members m
      where m.family_id = v_family_id
        and m.user_id <> p_user_id
        and m.role = 'guardian'
      order by m.joined_at asc, m.user_id asc
      limit 1;

      if v_successor is null then
        raise exception 'no remaining guardian';
      end if;

      update public.place_families
      set created_by = v_successor
      where id = v_family_id
        and created_by = p_user_id;

      select f.created_by
        into v_verified_created_by
      from public.place_families f
      where f.id = v_family_id;

      select exists (
        select 1
        from public.place_family_members m
        where m.family_id = v_family_id
          and m.user_id = v_successor
      )
      into v_successor_still_member;

      if v_verified_created_by is distinct from v_successor
         or v_successor_still_member is not true then
        raise exception 'ownership transfer failed';
      end if;
    elsif v_created_by is null then
      raise exception 'invalid family';
    end if;

    delete from public.place_family_members
    where family_id = v_family_id
      and user_id = p_user_id;
  end loop;
end;
$$;

revoke all on function public.purge_family_membership(uuid) from public;
revoke all on function public.purge_family_membership(uuid) from anon;
revoke all on function public.purge_family_membership(uuid) from authenticated;
grant execute on function public.purge_family_membership(uuid) to service_role;

comment on function public.purge_family_membership(uuid) is
  'Removes one verified user''s family membership after transferring created_by to a remaining guardian when that user created the family.';
