-- SUPABASE-30OCT-B3 minimum privileges for existing public tables.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production
-- until this file has been reviewed.
-- Does not remove tables, remove rows, change columns, or replace RLS policies. Reminder policies keep their USING and WITH CHECK
-- expressions and only move from PUBLIC to authenticated.

do $missing$
declare
  required text[] := array[
    'place_family_members',
    'place_location_shares',
    'place_e2ee_live_locations',
    'place_trip_shares',
    'place_shared_route_points',
    'place_safety_alerts',
    'place_safe_places',
    'place_voice_calls',
    'place_voice_call_signals',
    'reminder_push_schedules',
    'social_locations',
    'social_board_posts',
    'social_room_videos'
  ];
  missing text;
begin
  select string_agg(name, ', ')
    into missing
  from unnest(required) as name
  where to_regclass('public.' || name) is null;
  if missing is not null then
    raise exception 'public privilege hardening requires existing tables: %', missing;
  end if;
end
$missing$;

revoke all on table public.place_family_members from public, anon, authenticated, service_role;
revoke all on table public.place_location_shares from public, anon, authenticated, service_role;
revoke all on table public.place_e2ee_live_locations from public, anon, authenticated, service_role;
revoke all on table public.place_trip_shares from public, anon, authenticated, service_role;
revoke all on table public.place_shared_route_points from public, anon, authenticated, service_role;
revoke all on table public.place_safety_alerts from public, anon, authenticated, service_role;
revoke all on table public.place_safe_places from public, anon, authenticated, service_role;
revoke all on table public.place_voice_calls from public, anon, authenticated, service_role;
revoke all on table public.place_voice_call_signals from public, anon, authenticated, service_role;
revoke all on table public.reminder_push_schedules from public, anon, authenticated, service_role;
revoke all on table public.social_locations from public, anon, authenticated, service_role;
revoke all on table public.social_board_posts from public, anon, authenticated, service_role;
revoke all on table public.social_room_videos from public, anon, authenticated, service_role;

grant select, update on table public.place_family_members to authenticated;
grant select, insert, update on table public.place_location_shares to authenticated;
grant select, insert, update, delete on table public.place_e2ee_live_locations to authenticated;
grant select, insert, update on table public.place_trip_shares to authenticated;
grant select, insert, delete on table public.place_shared_route_points to authenticated;
grant select, insert on table public.place_safety_alerts to authenticated;
grant select, insert, update, delete on table public.place_safe_places to authenticated;
grant select, insert, update on table public.place_voice_calls to authenticated;
grant select, insert on table public.place_voice_call_signals to authenticated;
grant select, insert, update, delete on table public.reminder_push_schedules to authenticated;
grant select, insert, update on table public.social_locations to authenticated;
grant select on table public.social_board_posts to anon;
grant select, insert, delete on table public.social_board_posts to authenticated;
grant select on table public.social_room_videos to anon;
grant select, insert, delete on table public.social_room_videos to authenticated;

-- Role list only. Omitting USING and WITH CHECK keeps the current expressions.
do $reminder_policies$
declare
  pol record;
begin
  for pol in
    select p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reminder_push_schedules'
      and (
        cardinality(p.polroles) = 0
        or 0 = any (p.polroles)
      )
  loop
    execute format(
      'alter policy %I on public.reminder_push_schedules to authenticated',
      pol.polname
    );
  end loop;
end
$reminder_policies$;
