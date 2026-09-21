-- BILL-1 usage events. DO NOT apply to production without explicit approval.
-- Service-role / backend only. No client policies grant insert/select.

create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;

create table if not exists billing.usage_events (
  event_id text primary key,
  reference_id text not null,
  user_id uuid,
  event_type text not null,
  feature text not null,
  provider text not null default '',
  model text not null default '',
  unit text not null,
  quantity integer not null check (quantity >= 0),
  occurred_at timestamptz not null,
  cost_basis text not null default 'UNAVAILABLE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists usage_events_event_id_uidx
  on billing.usage_events (event_id);

create index if not exists usage_events_user_occurred_idx
  on billing.usage_events (user_id, occurred_at desc);

alter table billing.usage_events enable row level security;
alter table billing.usage_events force row level security;
revoke all privileges on table billing.usage_events from public, anon, authenticated;

drop policy if exists "No direct client access to usage events" on billing.usage_events;
create policy "No direct client access to usage events"
on billing.usage_events as restrictive for all to public
using (false)
with check (false);

comment on table billing.usage_events is
  'Cost-metering usage events. Metadata is allowlisted (tokens/counts only). No prompts, audio, images, or coordinates.';
