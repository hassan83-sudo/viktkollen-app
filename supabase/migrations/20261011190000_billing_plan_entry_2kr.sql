-- feature/2kr-plan: 2 SEK/month entry tier in the server plan catalog.
-- Forward-only. The earlier billing migrations (20260921180000, 20260923130000,
-- 20260923193000) are left unchanged because they may already be applied; this file
-- brings the database catalog in line with src/services/billing/planCatalog.js.
-- Migration file only. DO NOT apply to staging or production without explicit approval.
-- Does not sell any plan: no plan_commercial_controls row is inserted for the new plan,
-- and missing rows mean not for sale. No checkout, payment or subscription changes.
-- Idempotent: running it again does not shift display orders a second time.

-- 1. Catalog order: the 2 SEK plan becomes the first paid plan (display_order 1)
--    and existing paid plans move down one step, exactly like planCatalog.js.
update billing.plans
set display_order = display_order + 1
where plan_id like 'plan.prelim.sek.month.%'
  and plan_id <> 'plan.prelim.sek.month.02'
  and not exists (
    select 1 from billing.plans existing where existing.plan_id = 'plan.prelim.sek.month.02'
  );

insert into billing.plans (
  plan_id, name, price_minor, currency, billing_interval, active, display_order, version, price_status
) values
  ('plan.prelim.sek.month.02', 'Prelim 2 SEK/month', 200, 'SEK', 'month', true, 1, 1, 'PRELIMINARY')
on conflict (plan_id) do nothing;

-- 2. Entitlements for the 2 SEK plan, matching the launch quota matrix
--    (commercialPlanMatrix.js): never less than Free on metered features.
insert into billing.plan_entitlements (plan_id, feature, enabled, limit_kind, limit_value, unit, quota_status)
select 'plan.prelim.sek.month.02', f.feature, true, f.limit_kind, f.limit_value, f.unit, 'PRELIMINARY'
from (values
  ('ai.text.request', 'NUMBER', 25, 'requests'),
  ('food.scan', 'NUMBER', 5, 'requests'),
  ('body.scan', 'NUMBER', 3, 'requests'),
  ('ai.eye.analysis', 'NUMBER', 25, 'requests'),
  ('ai.ear.interpret', 'UNLIMITED', null, 'requests'),
  ('ai.voice.session', 'UNLIMITED', null, 'sessions'),
  ('tts.request', 'UNLIMITED', null, 'requests'),
  ('gps.live.session', 'UNLIMITED', null, 'sessions'),
  ('friend_chat', 'UNLIMITED', null, 'writes'),
  ('gps_standard', 'UNLIMITED', null, 'sessions'),
  ('ready_avatar', 'UNLIMITED', null, 'writes'),
  ('smart_ai', 'UNLIMITED', null, 'requests')
) as f(feature, limit_kind, limit_value, unit)
on conflict (plan_id, feature) do nothing;

-- 3. Commercial controls: allow the new plan id and one more display slot.
--    Stored admin rows (if any) keep their relative order by moving down one step;
--    the guard trigger requires each update to bump version by exactly 1.
--    No audit rows are written: this is a catalog migration, not an admin action.
alter table billing.plan_commercial_controls drop constraint if exists plan_commercial_plan_known;
alter table billing.plan_commercial_controls drop constraint if exists plan_commercial_order_bounds;

alter table billing.plan_commercial_controls add constraint plan_commercial_plan_known check (plan_id in (
    'plan.prelim.sek.month.02',
    'plan.prelim.sek.month.04',
    'plan.prelim.sek.month.07',
    'plan.prelim.sek.month.09',
    'plan.prelim.sek.month.12',
    'plan.prelim.sek.month.15',
    'plan.prelim.sek.month.19',
    'plan.prelim.sek.month.29',
    'plan.prelim.sek.month.39',
    'plan.prelim.sek.month.49',
    'plan.prelim.sek.month.59',
    'plan.prelim.sek.month.69',
    'plan.prelim.sek.month.79',
    'plan.prelim.sek.month.89',
    'plan.prelim.sek.month.99'
));
alter table billing.plan_commercial_controls add constraint plan_commercial_order_bounds check (display_order between 1 and 15);

-- Shift stored rows after the constraints are replaced: the unique display_order
-- constraint is deferred, and ALTER TABLE is not allowed while its checks are pending.
-- Runs before paid_candidate_plans() is redefined, so a second run is a no-op.
update billing.plan_commercial_controls
set display_order = display_order + 1,
    version = version + 1
where not exists (
  select 1 from billing.paid_candidate_plans() catalog
  where catalog.plan_id = 'plan.prelim.sek.month.02'
);

create or replace function billing.paid_candidate_plans()
returns table(plan_id text, display_order integer)
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select catalog.plan_id, catalog.display_order
  from (
    values
      ('plan.prelim.sek.month.02'::text, 1),
      ('plan.prelim.sek.month.04'::text, 2),
      ('plan.prelim.sek.month.07'::text, 3),
      ('plan.prelim.sek.month.09'::text, 4),
      ('plan.prelim.sek.month.12'::text, 5),
      ('plan.prelim.sek.month.15'::text, 6),
      ('plan.prelim.sek.month.19'::text, 7),
      ('plan.prelim.sek.month.29'::text, 8),
      ('plan.prelim.sek.month.39'::text, 9),
      ('plan.prelim.sek.month.49'::text, 10),
      ('plan.prelim.sek.month.59'::text, 11),
      ('plan.prelim.sek.month.69'::text, 12),
      ('plan.prelim.sek.month.79'::text, 13),
      ('plan.prelim.sek.month.89'::text, 14),
      ('plan.prelim.sek.month.99'::text, 15)
  ) as catalog(plan_id, display_order)
$$;

-- 4. Audit snapshots accept display_order 1..15 (unchanged otherwise).
create or replace function billing.admin_audit_snapshot(p_input jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  k text;
  v jsonb;
  lowered text;
  copied jsonb := '{}'::jsonb;
  val text;
  ver integer;
  amount bigint;
  display_order integer;
begin
  if p_input is null then
    return '{}'::jsonb;
  end if;
  if pg_catalog.octet_length(p_input::text) > 2048 then
    raise exception 'audit_payload_too_large';
  end if;
  if pg_catalog.jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'audit_nested_payload';
  end if;
  for k, v in select * from pg_catalog.jsonb_each(p_input)
  loop
    lowered := pg_catalog.lower(k);
    if lowered in (
      'api_key',
      'audio',
      'auth_token',
      'bank',
      'card_number',
      'chat_text',
      'coordinates',
      'credential',
      'cvv',
      'database_url',
      'gps',
      'image',
      'latitude',
      'longitude',
      'password',
      'prompt',
      'response',
      'secret',
      'service_role',
      'token',
      'transcript'
    )
       or lowered like '%password%'
       or lowered like '%api_key%'
       or lowered like '%auth_token%'
       or lowered like '%service_role%'
       or lowered like '%database_url%'
       or lowered like '%card_number%'
       or lowered like '%cvv%'
       or lowered like '%prompt%'
       or lowered like '%transcript%'
       or lowered like '%chat_text%'
       or lowered like '%coordinates%'
       or lowered like '%credential%'
       or lowered like '%secret%'
    then
      raise exception 'audit_sensitive_field';
    end if;
    if pg_catalog.jsonb_typeof(v) in ('object', 'array') then
      raise exception 'audit_nested_payload';
    end if;
  end loop;
  foreach k in array array[
    'permission',
    'status',
    'target_id',
    'target_type',
    'user_id',
    'feature_id',
    'mode',
    'reason_code',
    'provider_id',
    'threshold_id',
    'scope',
    'period',
    'limit_mode',
    'currency',
    'plan_id',
    'field'
  ]
  loop
    if p_input ? k and pg_catalog.jsonb_typeof(p_input -> k) = 'string' then
      val := p_input ->> k;
      if pg_catalog.char_length(val) > 120 then
        raise exception 'audit_payload_too_large';
      end if;
      copied := copied || pg_catalog.jsonb_build_object(k, val);
    end if;
  end loop;
  if p_input ? 'version' and pg_catalog.jsonb_typeof(p_input -> 'version') = 'number' then
    ver := (p_input ->> 'version')::integer;
    if ver >= 1 then
      copied := copied || pg_catalog.jsonb_build_object('version', ver);
    end if;
  end if;
  if p_input ? 'display_order' and pg_catalog.jsonb_typeof(p_input -> 'display_order') = 'number' then
    display_order := (p_input ->> 'display_order')::integer;
    if display_order between 1 and 15 and (p_input ->> 'display_order') !~ '\.' then
      copied := copied || pg_catalog.jsonb_build_object('display_order', display_order);
    end if;
  end if;
  if p_input ? 'amount_minor' and pg_catalog.jsonb_typeof(p_input -> 'amount_minor') = 'number' then
    amount := (p_input ->> 'amount_minor')::bigint;
    if amount >= 0 and amount <= 9007199254740991 and (p_input ->> 'amount_minor') !~ '\.' then
      copied := copied || pg_catalog.jsonb_build_object('amount_minor', amount);
    end if;
  end if;
  if p_input ? 'enabled' and pg_catalog.jsonb_typeof(p_input -> 'enabled') = 'boolean' then
    copied := copied || pg_catalog.jsonb_build_object('enabled', (p_input ->> 'enabled')::boolean);
  end if;
  if p_input ? 'enabled_for_sale' and pg_catalog.jsonb_typeof(p_input -> 'enabled_for_sale') = 'boolean' then
    copied := copied || pg_catalog.jsonb_build_object('enabled_for_sale', (p_input ->> 'enabled_for_sale')::boolean);
  end if;
  if pg_catalog.octet_length(copied::text) > 2048 then
    raise exception 'audit_payload_too_large';
  end if;
  return copied;
end;
$$;

-- create or replace keeps the existing (revoked) privileges; restate them explicitly.
revoke all on function billing.paid_candidate_plans() from public, anon, authenticated, service_role;
revoke all on function billing.admin_audit_snapshot(jsonb) from public, anon, authenticated, service_role;
