-- Security Center: aggregate repeated events and keep the ledger bounded.
-- Apply to staging first; production requires separate approval.
--
-- Every 429 or denied premium call used to insert one row, so a client
-- hammering an endpoint could grow the table without limit. Repeats of the
-- same type and feature within 60 seconds now increase event_count on one
-- row, and rows not seen for 90 days are removed. Still no user ids, IPs,
-- emails, tokens or request content.

-- Existing rows keep their own time: last_seen_at starts as occurred_at, so
-- old events are neither reordered nor kept past the 90-day retention.
-- Only on the first run, so a re-run never resets aggregated rows.
do $migration$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'security_center' and table_name = 'events' and column_name = 'last_seen_at'
  ) then
    alter table security_center.events add column last_seen_at timestamptz;
    update security_center.events set last_seen_at = occurred_at;
    alter table security_center.events alter column last_seen_at set default now();
    alter table security_center.events alter column last_seen_at set not null;
  end if;
end
$migration$;

alter table security_center.events
  add column if not exists event_count integer not null default 1;

alter table security_center.events drop constraint if exists events_event_count_check;
alter table security_center.events add constraint events_event_count_check check (event_count > 0);

create index if not exists events_type_feature_last_seen_idx
  on security_center.events (type, feature, last_seen_at desc);
create index if not exists events_last_seen_idx
  on security_center.events (last_seen_at desc);

grant update, delete on security_center.events to service_role;

create or replace function security_center.record_event(p_type text, p_severity text, p_feature text)
returns bigint
language plpgsql security invoker set search_path = ''
as $body$
declare
  v_id bigint;
begin
  if p_type is null or p_feature is null or p_feature !~ '^[a-zA-Z0-9_-]{1,48}$'
     or p_severity is distinct from (case p_type
       when 'AUTH_FAILURE_BURST' then 'medium'
       when 'QUOTA_BYPASS_ATTEMPT' then 'high'
       when 'PREMIUM_ACCESS_DENIED' then 'medium'
       when 'BILLING_TAMPER_ATTEMPT' then 'high'
       when 'CROSS_USER_ACCESS_DENIED' then 'critical'
       when 'AI_USAGE_SPIKE' then 'high'
       when 'API_RATE_LIMITED' then 'medium'
       when 'MONITORING_UNAVAILABLE' then 'critical' end) then
    return null;
  end if;

  -- One writer per type and feature at a time, so concurrent repeats merge.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('security_center:' || p_type || ':' || p_feature));

  update security_center.events e
     set event_count = e.event_count + 1,
         last_seen_at = pg_catalog.now()
   where e.id = (
     select x.id from security_center.events x
      where x.type = p_type and x.feature = p_feature
        and x.last_seen_at >= pg_catalog.now() - interval '60 seconds'
      order by x.last_seen_at desc
      limit 1)
  returning e.id into v_id;

  if v_id is null then
    insert into security_center.events(type, severity, feature)
    values (p_type, p_severity, p_feature)
    returning id into v_id;
  end if;

  delete from security_center.events
   where last_seen_at < pg_catalog.now() - interval '90 days';

  return v_id;
end;
$body$;
revoke all on function security_center.record_event(text,text,text) from public, anon, authenticated;
grant execute on function security_center.record_event(text,text,text) to service_role;

-- The read functions now also return the count and when it was last seen.
drop function if exists public.security_center_recent_events(integer);
drop function if exists security_center.recent_events(integer);

create function security_center.recent_events(p_limit integer default 50)
returns table (id bigint, type text, severity text, feature text, occurred_at timestamptz, last_seen_at timestamptz, event_count integer)
language sql security invoker set search_path = ''
as $body$
  select e.id, e.type, e.severity, e.feature, e.occurred_at, e.last_seen_at, e.event_count
  from security_center.events e
  order by e.last_seen_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$body$;
revoke all on function security_center.recent_events(integer) from public, anon, authenticated;
grant execute on function security_center.recent_events(integer) to service_role;

create function public.security_center_recent_events(p_limit integer default 50)
returns table (id bigint, type text, severity text, feature text, occurred_at timestamptz, last_seen_at timestamptz, event_count integer)
language sql security invoker set search_path = ''
as $body$
  select * from security_center.recent_events(p_limit);
$body$;
revoke all on function public.security_center_recent_events(integer) from public, anon, authenticated;
grant execute on function public.security_center_recent_events(integer) to service_role;
