/**
 * Bounded BILL-1 usage query for later DB aggregation.
 * Selects billing metadata only — no prompt/response/audio/image/GPS.
 * Uses occurred_at range + event_type (usage_events_type_occurred_idx).
 * Not applied in BILL-4C2a. No new migration.
 */
export const COST_AGGREGATION_SQL = `
select
  event_id,
  event_type,
  feature,
  provider,
  model,
  unit,
  quantity,
  occurred_at,
  cost_basis,
  metadata
from billing.usage_events
where occurred_at >= $1
  and occurred_at < $2
  and event_type = any($3::text[])
`

export function createPostgresUsagePeriodReader(query) {
  return {
    async listInPeriod({ eventTypes, period_end, period_start }) {
      return query(COST_AGGREGATION_SQL, [period_start, period_end, eventTypes])
    },
  }
}
