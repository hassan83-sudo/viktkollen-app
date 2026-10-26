-- Isolated test fixture for the ACTUAL mark_renewal_failed migration (no lifecycle stub).
alter table billing.subscriptions
  add column past_due_grace_until timestamptz,
  add column pending_plan_change text,
  add column pending_plan_id text;
create table billing.subscription_events (
  external_event_id text primary key, subscription_id text not null,
  operation text, from_cancel_at_period_end boolean, to_cancel_at_period_end boolean,
  from_plan_id text, to_plan_id text, from_plan_version integer, to_plan_version integer,
  from_status text, to_status text, previous_period_end timestamptz, new_period_end timestamptz,
  previous_pending_plan_change text, previous_pending_plan_id text,
  to_pending_plan_change text, to_pending_plan_id text, past_due_grace_until timestamptz
);
