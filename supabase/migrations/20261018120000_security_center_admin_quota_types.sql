-- Security Center Sprint 2: two server-detected event types.
-- Apply to staging first; production requires separate approval.
--
-- ADMIN_ACCESS_DENIED (high): a verified non-admin reached an admin endpoint.
-- QUOTA_EXCEEDED (medium): billing refused a metered call because the quota
-- was used up. Before this, quota denials were recorded as API_RATE_LIMITED.
-- Still no user ids, IPs, emails, tokens or request content.

alter table security_center.events drop constraint if exists events_type_check;
alter table security_center.events add constraint events_type_check check (type in (
  'AUTH_FAILURE_BURST','QUOTA_BYPASS_ATTEMPT','PREMIUM_ACCESS_DENIED','BILLING_TAMPER_ATTEMPT',
  'CROSS_USER_ACCESS_DENIED','AI_USAGE_SPIKE','API_RATE_LIMITED','MONITORING_UNAVAILABLE',
  'ADMIN_ACCESS_DENIED','QUOTA_EXCEEDED'
));

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
       when 'MONITORING_UNAVAILABLE' then 'critical'
       when 'ADMIN_ACCESS_DENIED' then 'high'
       when 'QUOTA_EXCEEDED' then 'medium' end) then
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
