-- AI Bug Monitor V1 durable reports.
-- DO NOT apply to production.
-- DO NOT apply to staging until this file has been reviewed.
-- Local schema only. No backfill. Does not alter billing, customer, or camera tables.
--
-- Clients never receive table privileges. The overview is readable only through
-- bug_monitor.summary(), which is executable by service_role after the API has
-- verified a billing admin. actor_key is a hash or the literal "server".

create schema if not exists bug_monitor;

revoke all on schema bug_monitor from public, anon, authenticated;
grant usage on schema bug_monitor to service_role;

create table if not exists bug_monitor.reports (
  report_id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_key text not null,
  app_version text not null,
  error_type text not null,
  feature text not null,
  fingerprint text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.now(),
  release_name text not null,
  runtime_name text not null,
  severity text not null,
  source_name text not null,
  constraint reports_actor_key_check check (actor_key ~ '^(server|[a-f0-9]{16})$'),
  constraint reports_app_version_check check (app_version ~ '^[0-9A-Za-z._-]{1,32}$'),
  constraint reports_error_type_check check (error_type in (
    'ai-help', 'auth', 'chunkLoad', 'conflict', 'import', 'network',
    'permission', 'rateLimit', 'render', 'server', 'storage', 'timeout',
    'unknown', 'validation'
  )),
  constraint reports_feature_check check (feature in (
    'ai-coach', 'ai-help', 'app', 'auth', 'billing', 'body-scan',
    'camera', 'food-scan', 'other'
  )),
  constraint reports_fingerprint_check check (
    fingerprint ~ '^[a-z][A-Za-z0-9-]{3,47}$'
    and position('@' in fingerprint) = 0
  ),
  constraint reports_release_check check (release_name in ('development', 'local', 'preview', 'production')),
  constraint reports_runtime_check check (runtime_name in ('browser', 'server')),
  constraint reports_severity_check check (severity in ('high', 'low', 'medium')),
  constraint reports_source_check check (source_name in ('ai-help', 'backend', 'frontend')),
  constraint reports_high_severity_check check (
    severity <> 'high'
    or error_type in ('chunkLoad', 'conflict', 'render', 'server', 'storage')
  )
);

create index if not exists reports_actor_received_idx
  on bug_monitor.reports (actor_key, received_at desc);

create index if not exists reports_fingerprint_received_idx
  on bug_monitor.reports (fingerprint, received_at desc);

create table if not exists bug_monitor.acknowledgements (
  fingerprint text primary key,
  acknowledged_at timestamptz not null default pg_catalog.now(),
  constraint acknowledgements_fingerprint_check check (fingerprint ~ '^[a-z][A-Za-z0-9-]{3,47}$')
);

alter table bug_monitor.reports enable row level security;
alter table bug_monitor.reports force row level security;
alter table bug_monitor.acknowledgements enable row level security;
alter table bug_monitor.acknowledgements force row level security;

drop policy if exists reports_deny_all on bug_monitor.reports;
create policy reports_deny_all
on bug_monitor.reports
as restrictive
for all
to public
using (false)
with check (false);

drop policy if exists acknowledgements_deny_all on bug_monitor.acknowledgements;
create policy acknowledgements_deny_all
on bug_monitor.acknowledgements
as restrictive
for all
to public
using (false)
with check (false);

revoke all on table bug_monitor.reports from public, anon, authenticated, service_role;
revoke all on table bug_monitor.acknowledgements from public, anon, authenticated, service_role;

create or replace function bug_monitor.accept_report(
  p_actor_key text,
  p_app_version text,
  p_error_type text,
  p_feature text,
  p_fingerprint text,
  p_occurred_at timestamptz,
  p_release text,
  p_runtime text,
  p_severity text,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  recent_count integer;
  duplicate_count integer;
begin
  if p_actor_key is null or p_actor_key !~ '^(server|[a-f0-9]{16})$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_error_type is null or p_error_type not in (
    'ai-help', 'auth', 'chunkLoad', 'conflict', 'import', 'network',
    'permission', 'rateLimit', 'render', 'server', 'storage', 'timeout',
    'unknown', 'validation'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_feature is null or p_feature not in (
    'ai-coach', 'ai-help', 'app', 'auth', 'billing', 'body-scan',
    'camera', 'food-scan', 'other'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_fingerprint is null
     or p_fingerprint !~ '^[a-z][A-Za-z0-9-]{3,47}$'
     or pg_catalog.left(p_fingerprint, pg_catalog.char_length(p_error_type)) is distinct from p_error_type
     or pg_catalog.strpos(p_fingerprint, '@') > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_app_version is null or p_app_version !~ '^[0-9A-Za-z._-]{1,32}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_release is null or p_release not in ('development', 'local', 'preview', 'production') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_runtime is null or p_runtime not in ('browser', 'server') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_source is null or p_source not in ('ai-help', 'backend', 'frontend') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'INVALID_REPORT');
  end if;
  if p_severity is null or p_severity not in ('high', 'low', 'medium') then
    p_severity := 'medium';
  end if;
  if p_severity = 'high' and p_error_type not in ('chunkLoad', 'conflict', 'render', 'server', 'storage') then
    p_severity := 'medium';
  end if;
  if p_occurred_at is null
     or p_occurred_at > pg_catalog.now() + interval '5 minutes'
     or p_occurred_at < pg_catalog.now() - interval '7 days' then
    p_occurred_at := pg_catalog.now();
  end if;

  -- One transaction lock so every server instance shares the same cap and dedupe.
  perform pg_catalog.pg_advisory_xact_lock(824615101);

  select count(*) into recent_count
  from bug_monitor.reports
  where actor_key = p_actor_key
    and received_at >= pg_catalog.now() - interval '1 hour';
  if recent_count >= 30 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  select count(*) into duplicate_count
  from bug_monitor.reports
  where actor_key = p_actor_key
    and fingerprint = p_fingerprint
    and received_at >= pg_catalog.now() - interval '60 seconds';
  if duplicate_count > 0 then
    return pg_catalog.jsonb_build_object(
      'duplicate', true,
      'fingerprint', p_fingerprint,
      'ok', true,
      'stored', false
    );
  end if;

  insert into bug_monitor.reports (
    actor_key,
    app_version,
    error_type,
    feature,
    fingerprint,
    occurred_at,
    release_name,
    runtime_name,
    severity,
    source_name
  ) values (
    p_actor_key,
    p_app_version,
    p_error_type,
    p_feature,
    p_fingerprint,
    p_occurred_at,
    p_release,
    p_runtime,
    p_severity,
    p_source
  );

  delete from bug_monitor.reports
  where report_id in (
    select report_id
    from bug_monitor.reports
    order by received_at desc
    offset 400
  );

  return pg_catalog.jsonb_build_object(
    'fingerprint', p_fingerprint,
    'ok', true,
    'stored', true
  );
end;
$$;

create or replace function bug_monitor.acknowledge_report(p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-z][A-Za-z0-9-]{3,47}$' then
    return false;
  end if;
  if not exists (
    select 1 from bug_monitor.reports where fingerprint = p_fingerprint
  ) then
    return false;
  end if;
  insert into bug_monitor.acknowledgements (fingerprint)
  values (p_fingerprint)
  on conflict (fingerprint) do nothing;
  return true;
end;
$$;

create or replace function bug_monitor.summary()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with grouped as (
    select
      r.fingerprint,
      (pg_catalog.array_agg(r.error_type order by r.occurred_at desc))[1] as error_type,
      (pg_catalog.array_agg(r.feature order by r.occurred_at desc))[1] as feature,
      (pg_catalog.array_agg(r.app_version order by r.occurred_at desc))[1] as app_version,
      (pg_catalog.array_agg(r.source_name order by r.occurred_at desc))[1] as source_name,
      pg_catalog.max(r.occurred_at) as latest_at,
      count(*)::integer as report_count,
      count(distinct r.actor_key)::integer as affected_count,
      case
        when pg_catalog.bool_or(r.severity = 'high') then 'high'
        when pg_catalog.bool_or(r.severity = 'medium') then 'medium'
        else 'low'
      end as severity
    from bug_monitor.reports r
    group by r.fingerprint
  ),
  labeled as (
    select
      g.affected_count,
      g.app_version,
      g.error_type,
      g.feature,
      g.fingerprint,
      g.latest_at,
      g.report_count,
      g.severity,
      g.source_name,
      case
        when a.fingerprint is not null then 'acknowledged'
        when g.report_count >= 2 or g.affected_count >= 2 then 'recurring'
        else 'new'
      end as status
    from grouped g
    left join bug_monitor.acknowledgements a on a.fingerprint = g.fingerprint
  ),
  top_groups as (
    select *
    from labeled
    order by latest_at desc
    limit 40
  )
  select pg_catalog.jsonb_build_object(
    'acknowledgedCount', (select count(*) from top_groups where status = 'acknowledged'),
    'affectedCount', (select count(distinct actor_key) from bug_monitor.reports),
    'groups', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'affectedCount', affected_count,
        'appVersion', app_version,
        'count', report_count,
        'errorType', error_type,
        'feature', feature,
        'fingerprint', fingerprint,
        'latestAt', latest_at,
        'severity', severity,
        'source', source_name,
        'status', status
      ) order by latest_at desc)
      from top_groups
    ), '[]'::jsonb),
    'newCount', (select count(*) from top_groups where status = 'new'),
    'recurringCount', (select count(*) from top_groups where status = 'recurring')
  );
$$;

revoke all on function bug_monitor.accept_report(text, text, text, text, text, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function bug_monitor.acknowledge_report(text) from public, anon, authenticated;
revoke all on function bug_monitor.summary() from public, anon, authenticated;
grant execute on function bug_monitor.accept_report(text, text, text, text, text, timestamptz, text, text, text, text) to service_role;
grant execute on function bug_monitor.acknowledge_report(text) to service_role;
grant execute on function bug_monitor.summary() to service_role;
