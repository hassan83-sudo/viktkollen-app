-- Security Center #38. Apply to staging first; production requires separate approval.
create schema if not exists security_center;
revoke all on schema security_center from public, anon, authenticated;
grant usage on schema security_center to service_role;

create table if not exists security_center.events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('AUTH_FAILURE_BURST','QUOTA_BYPASS_ATTEMPT','PREMIUM_ACCESS_DENIED','BILLING_TAMPER_ATTEMPT','CROSS_USER_ACCESS_DENIED','AI_USAGE_SPIKE','API_RATE_LIMITED','MONITORING_UNAVAILABLE')),
  severity text not null check (severity in ('medium','high','critical')),
  feature text not null check (feature ~ '^[a-zA-Z0-9_-]{1,48}$'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table security_center.events enable row level security;
revoke all on security_center.events from public, anon, authenticated;
grant select, insert on security_center.events to service_role;
grant usage, select on sequence security_center.events_id_seq to service_role;

create or replace function security_center.recent_events(p_limit integer default 50)
returns table (id bigint, type text, severity text, feature text, occurred_at timestamptz)
language sql security invoker set search_path = ''
as $$
  select e.id, e.type, e.severity, e.feature, e.occurred_at
  from security_center.events e
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
revoke all on function security_center.recent_events(integer) from public, anon, authenticated;
grant execute on function security_center.recent_events(integer) to service_role;

create or replace function security_center.record_event(p_type text, p_severity text, p_feature text)
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare result_id bigint;
begin
  if p_type not in ('AUTH_FAILURE_BURST','QUOTA_BYPASS_ATTEMPT','PREMIUM_ACCESS_DENIED','BILLING_TAMPER_ATTEMPT','CROSS_USER_ACCESS_DENIED','AI_USAGE_SPIKE','API_RATE_LIMITED','MONITORING_UNAVAILABLE')
    or p_severity <> case p_type
      when 'AUTH_FAILURE_BURST' then 'medium'
      when 'QUOTA_BYPASS_ATTEMPT' then 'high'
      when 'PREMIUM_ACCESS_DENIED' then 'medium'
      when 'BILLING_TAMPER_ATTEMPT' then 'high'
      when 'CROSS_USER_ACCESS_DENIED' then 'critical'
      when 'AI_USAGE_SPIKE' then 'high'
      when 'API_RATE_LIMITED' then 'medium'
      when 'MONITORING_UNAVAILABLE' then 'critical' end
    or p_feature !~ '^[a-zA-Z0-9_-]{1,48}$' then
    raise exception 'invalid security event';
  end if;
  insert into security_center.events(type,severity,feature)
    values (p_type,p_severity,p_feature) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function security_center.record_event(text,text,text) from public, anon, authenticated;
grant execute on function security_center.record_event(text,text,text) to service_role;
