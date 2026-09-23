-- BILL-6B2C durable provider telemetry allowlist.
-- Local migration only. DO NOT apply to staging. DO NOT apply to production in this sprint.
-- Does not change plan prices, entitlements, quotas, or sale availability.
-- MEASURED is a legal cost_basis state. This migration does not write monetary amounts.

alter table billing.usage_events drop constraint if exists usage_events_cost_basis_known;
alter table billing.usage_events add constraint usage_events_cost_basis_known check (
  cost_basis in ('ESTIMATED', 'MEASURED', 'UNAVAILABLE')
);

alter table billing.usage_events drop constraint if exists usage_events_metadata_object;
alter table billing.usage_events add constraint usage_events_metadata_object check (
  jsonb_typeof(metadata) = 'object'
  and metadata - array[
    'cached_tokens',
    'gps_history_write_count',
    'gps_recipient_count',
    'gps_update_count',
    'image_count',
    'image_tokens',
    'input_tokens',
    'output_tokens',
    'total_tokens',
    'usage_basis',
    'voice_seconds'
  ] = '{}'::jsonb
);

alter table billing.usage_events drop constraint if exists usage_events_metadata_values;
alter table billing.usage_events add constraint usage_events_metadata_values check (
  (not (metadata ? 'usage_basis') or (metadata->>'usage_basis') in ('MEASURED', 'ESTIMATED', 'UNAVAILABLE'))
  and (not (metadata ? 'cached_tokens') or (
    jsonb_typeof(metadata->'cached_tokens') = 'number'
    and (metadata->>'cached_tokens') ~ '^[0-9]+$'
  ))
  and (not (metadata ? 'image_count') or (
    jsonb_typeof(metadata->'image_count') = 'number'
    and (metadata->>'image_count') ~ '^[0-9]+$'
  ))
  and (not (metadata ? 'image_tokens') or (
    jsonb_typeof(metadata->'image_tokens') = 'number'
    and (metadata->>'image_tokens') ~ '^[0-9]+$'
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
  and (not (metadata ? 'voice_seconds') or (
    jsonb_typeof(metadata->'voice_seconds') = 'number'
    and (metadata->>'voice_seconds') ~ '^[0-9]+$'
  ))
  and (not (metadata ? 'gps_update_count') or (
    jsonb_typeof(metadata->'gps_update_count') = 'number'
    and (metadata->>'gps_update_count') ~ '^[0-9]+$'
  ))
  and (not (metadata ? 'gps_recipient_count') or (
    jsonb_typeof(metadata->'gps_recipient_count') = 'number'
    and (metadata->>'gps_recipient_count') ~ '^[0-9]+$'
  ))
  and (not (metadata ? 'gps_history_write_count') or (
    jsonb_typeof(metadata->'gps_history_write_count') = 'number'
    and (metadata->>'gps_history_write_count') ~ '^[0-9]+$'
  ))
);
