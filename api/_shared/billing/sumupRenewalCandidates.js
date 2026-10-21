/**
 * Read-only selection for candidate renewals.
 * This is NOT permission to charge: the database must recheck eligibility
 * under an exclusive claim before any provider call.
 */
export function selectDueRenewalCandidates(rows, { now = new Date(), limit = 20 } = {}) {
  const time = new Date(now).getTime()
  if (!Array.isArray(rows) || !Number.isFinite(time) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('INVALID_RENEWAL_SELECTION')
  }
  const seen = new Set()
  const selected = []
  for (const row of rows) {
    if (selected.length >= limit) break
    if (!row || row.provider !== 'sumup' || !['active', 'past_due'].includes(row.status)) continue
    if (row.cancel_at_period_end === true || !row.subscription_id) continue
    if (typeof row.current_period_end !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(row.current_period_end)) continue
    const end = new Date(row.current_period_end).getTime()
    if (!Number.isFinite(end) || end > time) continue
    const key = String(row.subscription_id) + ':' + new Date(end).toISOString()
    if (seen.has(key)) continue
    seen.add(key)
    selected.push({ subscriptionId: row.subscription_id, periodEnd: new Date(end).toISOString() })
  }
  return selected
}
