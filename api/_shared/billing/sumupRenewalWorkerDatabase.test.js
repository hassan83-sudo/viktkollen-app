import { describe, it, expect, vi } from 'vitest'
import { createSumUpRenewalWorkerDatabase, RENEWAL_WORKER_SQL } from './sumupRenewalWorkerDatabase.js'

describe('renewal worker database', () => {
  it('maps trusted SQL facts without exposing instrument tokens', async () => {
    const execute = vi.fn(async () => ({ rows: [{ subscription_id: 'sub', period_end: new Date('2026-10-01Z'),
      customer_id: 'customer', amount_minor: '1900', currency: 'SEK', instrument_fingerprint: 'fingerprint' }] }))
    const store = createSumUpRenewalWorkerDatabase({ executor: { execute } })
    expect(await store.listDue({ limit: 20 })).toEqual([{ subscriptionId: 'sub', periodEnd: '2026-10-01T00:00:00.000Z',
      customerId: 'customer', amountMinor: 1900, currency: 'SEK', fingerprint: 'fingerprint' }])
    expect(execute).toHaveBeenCalledWith({ text: RENEWAL_WORKER_SQL.list, values: [20] })
  })
  it('refuses an unrelated claim response', async () => {
    const store = createSumUpRenewalWorkerDatabase({ executor: { execute: async () => ({ rows: [{ result: { claimed: true, status: 'processing', checkout_reference: 'other' } }] }) } })
    await expect(store.claim({ checkoutReference: 'expected' })).rejects.toThrow('INVALID_RENEWAL_CLAIM')
  })
  it('returns the authoritative bound price and plan snapshot', async () => {
    const store = createSumUpRenewalWorkerDatabase({ executor: { execute: async () => ({ rows: [{ result: {
      bound: true, customer_id: 'customer', amount_minor: 900, currency: 'SEK', plan_id: 'next', plan_version: 2,
    } }] }) } })
    expect(await store.bind({})).toEqual({ bound: true, customerId: 'customer', amountMinor: 900, currency: 'SEK', planId: 'next', planVersion: 2 })
  })
  it('refuses an older binding response without the authoritative price', async () => {
    const store = createSumUpRenewalWorkerDatabase({ executor: { execute: async () => ({ rows: [{ result: { bound: true } }] }) } })
    await expect(store.bind({})).rejects.toThrow('INVALID_RENEWAL_BINDING')
  })
  it('requires confirmed durable binding', async () => {
    const execute = vi.fn(async () => ({ rows: [{ result: { bound: false } }] }))
    const store = createSumUpRenewalWorkerDatabase({ executor: { execute } })
    await expect(store.bind({ checkoutReference: 'ref', providerCheckoutRef: 'checkout', subscriptionId: 'sub',
      periodEnd: '2026-10-01Z', nextPeriodEnd: '2026-11-01Z' })).rejects.toThrow('INVALID_RENEWAL_BINDING')
    expect(execute).toHaveBeenCalledWith({ text: RENEWAL_WORKER_SQL.bind, values: ['ref', 'checkout', 'sub', '2026-10-01Z', '2026-11-01Z'] })
  })
})
