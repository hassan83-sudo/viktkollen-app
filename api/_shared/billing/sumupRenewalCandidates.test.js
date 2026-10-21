import { describe, expect, it } from 'vitest'
import { selectDueRenewalCandidates } from './sumupRenewalCandidates.js'

const base = {
  subscription_id: 'sub-1',
  provider: 'sumup',
  status: 'active',
  current_period_end: '2026-10-01T00:00:00.000Z',
  cancel_at_period_end: false,
}

describe('read-only SumUp renewal candidates', () => {
  const options = { now: '2026-10-21T00:00:00.000Z' }

  it('selects one due subscription only once', () => {
    expect(selectDueRenewalCandidates([base, { ...base }], options)).toEqual([
      { subscriptionId: 'sub-1', periodEnd: base.current_period_end },
    ])
  })

  it('excludes cancellations, future periods, and other providers', () => {
    expect(selectDueRenewalCandidates([
      { ...base, cancel_at_period_end: true },
      { ...base, current_period_end: '2026-11-01T00:00:00.000Z' },
      { ...base, provider: 'other' },
    ], options)).toEqual([])
  })

  it('enforces batch limits', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ ...base, subscription_id: 'sub-' + index }))
    expect(selectDueRenewalCandidates(rows, { ...options, limit: 2 })).toHaveLength(2)
  })
})
