-- BILL-1A usage events. DO NOT apply to production without explicit approval.
-- Authoritative billing usage is append-only and server-side only.
--
-- Roles:
--   anon / authenticated / public: NO schema usage, NO table privileges,
--     FORCE RLS + restrictive deny-all (defense in depth).
--   service_role: schema usage + SELECT + INSERT only. Used from trusted
--     API/server code with SUPABASE_SERVICE_ROLE_KEY (never VITE_* / never
--     the browser bundle). UPDATE and DELETE are revoked and blocked by
--     trigger even if grants are later widened by mistake.
--
-- Idempotency scope: PRIMARY KEY (event_id) is globally unique. BILL-1
-- event_id is the server request id for a single provider call, not a
-- per-user sequence. Two users cannot share a request id; unrelated events
-- do not collide unless they reuse the same request id (then the second
-- write is a duplicate, not a second charge).
--
-- Cost catalog is application code (integer minor units). This table stores
-- usage quantities and occurred_at for historical price lookup — no money
-- columns, no floating-point currency, no provider secrets.
--
-- New event_type / unit values require a follow-up migration (CHECK lists
-- are closed). That is intentional: unknown units must not become
-- authoritative usage.
--
-- Retention / GDPR deletion is NOT defined here. Future trusted admin path
-- must replace or bypass the append-only trigger. Do not treat this table
-- as permanent storage policy.
--
-- Persistence is not wired in BILL-1 runtime (in-memory repository).
-- When wired, insert user_id from verified auth, never from a
-- client-supplied body field.

create schema if not exists billing;

revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

create table if not exists billing.usage_events (
  event_id text primary key,
  reference_id text not null,
  user_id uuid,
  event_type text not null,
  feature text not null,
  provider text not null default '',
  model text not null default '',
  unit text not null,
  quantity integer not null,
  occurred_at timestamptz not null default now(),
  cost_basis text not null default 'UNAVAILABLE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint usage_events_event_id_len check (
    char_length(event_id) between 1 and 180
  ),
  constraint usage_events_reference_id_len check (
    char_length(reference_id) between 1 and 180
  ),
  constraint usage_events_feature_len check (
    char_length(feature) between 1 and 80
  ),
  constraint usage_events_provider_len check (
    char_length(provider) <= 80
  ),
  constraint usage_events_model_len check (
    char_length(model) <= 80
  ),
  constraint usage_events_quantity_nonnegative check (
    quantity >= 0 and quantity <= 1000000000
  ),
  constraint usage_events_event_type_known check (
    event_type in (
      'ai.text.request',
      'ai.voice.session',
      'tts.request',
      'food.scan',
      'ai.eye.analysis',
      'ai.ear.interpret',
      'body.scan',
      'gps.live.session'
    )
  ),
  constraint usage_events_unit_known check (
    unit in (
      'requests',
      'tokens',
      'seconds',
      'images',
      'sessions',
      'writes',
      'reads'
    )
  ),
  constraint usage_events_cost_basis_known check (
    cost_basis in ('ESTIMATED', 'UNAVAILABLE')
  ),
  constraint usage_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
    and metadata - array[
      'cached_tokens',
      'image_count',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'usage_basis'
    ] = '{}'::jsonb
  ),
  constraint usage_events_metadata_values check (
    (not (metadata ? 'usage_basis') or (metadata->>'usage_basis') in ('MEASURED', 'ESTIMATED', 'UNAVAILABLE'))
    and (not (metadata ? 'cached_tokens') or (
      jsonb_typeof(metadata->'cached_tokens') = 'number'
      and (metadata->>'cached_tokens') ~ '^[0-9]+$'
    ))
    and (not (metadata ? 'image_count') or (
      jsonb_typeof(metadata->'image_count') = 'number'
      and (metadata->>'image_count') ~ '^[0-9]+$'
    ))
    and (not (metadata ? 'input_tokens') or (
      jsonb_typeof(metadata->'input_tokens') = 'number'
      and (metadata->>'input_tokens') ~ '^[0-9]+$'
    ))
    and (not (metadata ? 'output_tokens') or (
      jsonb_typeof(metadata->'output_tokens') = 'number'
      and (metadata->>'output_tokens') ~ '^[0-9]+$'
    ))
    and (not (metadata ? 'total_tokens') or (
      jsonb_typeof(metadata->'total_tokens') = 'number'
      and (metadata->>'total_tokens') ~ '^[0-9]+$'
    ))
  )
);

comment on table billing.usage_events is
  'Authoritative cost-metering usage events. Append-only. Metadata allowlist: tokens/counts/usage_basis only. No prompts, audio, images, coordinates, secrets, or money columns. occurred_at is the economic timestamp for catalog lookup.';

comment on column billing.usage_events.event_id is
  'Globally unique idempotency key (server request id). Not client-authoritative.';

comment on column billing.usage_events.user_id is
  'Optional uuid of the authenticated user derived server-side. Null when unknown. Never trust a client-supplied user_id.';

comment on column billing.usage_events.occurred_at is
  'When the usage occurred (historical pricing). Server sets this; default now().';

comment on column billing.usage_events.created_at is
  'Row insert time. Not used as the economic timestamp.';

comment on column billing.usage_events.metadata is
  'Allowlisted keys only: cached_tokens, image_count, input_tokens, output_tokens, total_tokens, usage_basis.';

comment on column billing.usage_events.quantity is
  'Non-negative integer usage quantity. Not a currency amount.';

create index if not exists usage_events_user_occurred_idx
  on billing.usage_events (user_id, occurred_at desc);

create index if not exists usage_events_type_occurred_idx
  on billing.usage_events (event_type, occurred_at desc);

alter table billing.usage_events enable row level security;
alter table billing.usage_events force row level security;

revoke all privileges on table billing.usage_events from public, anon, authenticated;
grant select, insert on table billing.usage_events to service_role;
revoke update, delete on table billing.usage_events from public, anon, authenticated, service_role;

drop policy if exists "No direct client access to usage events" on billing.usage_events;
create policy "No direct client access to usage events"
on billing.usage_events
as restrictive
for all
to public
using (false)
with check (false);

create or replace function billing.reject_usage_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'billing.usage_events is append-only';
end;
$$;

revoke all on function billing.reject_usage_event_mutation() from public, anon, authenticated;

drop trigger if exists usage_events_append_only on billing.usage_events;
create trigger usage_events_append_only
before update or delete on billing.usage_events
for each row
execute function billing.reject_usage_event_mutation();
