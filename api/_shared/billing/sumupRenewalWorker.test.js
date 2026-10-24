import { describe, it, expect, vi } from 'vitest'
import { createSumUpRenewalWorker } from './sumupRenewalWorker.js'
import { instrumentFingerprint, renewalReference } from './sumupRecurring.js'

const id = '00000000-0000-4000-8000-000000000001'
const tx = '00000000-0000-4000-8000-000000000002'
const token = 'server-only-token'
function setup() {
  const row = { subscriptionId: 'sub-1', periodEnd: '2026-01-31T12:00:00.000Z', customerId: 'customer-1',
    amountMinor: 1900, currency: 'SEK', fingerprint: instrumentFingerprint(token) }
  let claimed = false
  let checkout
  const store = {
    listDue: vi.fn(async () => [row]),
    claim: vi.fn(async () => { const first = !claimed; claimed = true; return { claimed: first, status: 'processing' } }),
    bind: vi.fn(async () => ({ bound: true })),
  }
  const transport = {
    listCheckouts: vi.fn(async () => checkout ? [checkout] : []),
    createCheckout: vi.fn(async body => (checkout = { ...body, id, status: 'PENDING' })),
    retrieveCheckout: vi.fn(async () => checkout),
    listPaymentInstruments: vi.fn(async () => [{ token }]),
    processCheckout: vi.fn(async () => { checkout = { ...checkout, status: 'PAID', transactions: [{ id: tx, status: 'SUCCESSFUL', amount: 19, currency: 'SEK' }] } }),
  }
  const finalizer = { recordFailed: vi.fn(async () => ({ recorded: true, alreadyRecorded: false })), reconcile: vi.fn(async () => ({ committed: true, alreadyCommitted: false })) }
  const worker = () => createSumUpRenewalWorker({ store, transport, finalizer, merchantCode: 'MERCHANT1' })
  return { row, store, transport, finalizer, worker }
}

describe('durable SumUp renewal worker', () => {
  it('binds before charging, commits verified payment, and clamps the next month', async () => {
    const f = setup()
    expect(await f.worker().run()).toMatchObject({ results: [{ outcome: 'paid' }] })
    expect(f.store.bind.mock.invocationCallOrder[0]).toBeLessThan(f.transport.processCheckout.mock.invocationCallOrder[0])
    expect(f.store.bind).toHaveBeenCalledWith(expect.objectContaining({ nextPeriodEnd: '2026-02-28T12:00:00.000Z' }))
    expect(f.transport.processCheckout).toHaveBeenCalledOnce()
    expect(f.finalizer.reconcile).toHaveBeenCalledWith(expect.objectContaining({ providerCheckoutId: id }))
  })
  it('only one concurrent worker may charge a subscription period', async () => {
    const f = setup()
    await Promise.all([f.worker().run(), f.worker().run()])
    expect(f.transport.createCheckout).toHaveBeenCalledOnce()
    expect(f.transport.processCheckout).toHaveBeenCalledOnce()
  })
  it('reconciles a paid checkout after a timeout and process restart without charging again', async () => {
    const f = setup()
    const process = f.transport.processCheckout.getMockImplementation()
    f.transport.processCheckout.mockImplementationOnce(async () => { await process(); throw new Error(token) })
    const first = await f.worker().run()
    expect(first.results[0].outcome).toBe('reconciliation_required')
    expect(JSON.stringify(first)).not.toContain(token)
    expect((await f.worker().run()).results[0].outcome).toBe('paid')
    expect(f.transport.processCheckout).toHaveBeenCalledOnce()
  })
  it('never recreates or reprocesses after a crash before checkout creation', async () => {
    const f = setup()
    f.transport.createCheckout.mockRejectedValueOnce(new Error('timeout'))
    await f.worker().run()
    await f.worker().run()
    expect(f.transport.createCheckout).toHaveBeenCalledOnce()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
  })
  it('does not charge when database binding fails', async () => {
    const f = setup()
    f.store.bind.mockRejectedValueOnce(new Error('cancelled'))
    await f.worker().run()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
    expect(f.finalizer.reconcile).not.toHaveBeenCalled()
  })
  it.each(['customer_id', 'amount', 'merchant_code', 'currency', 'id'])('rejects mismatched %s before charging', async key => {
    const f = setup()
    const create = f.transport.createCheckout.getMockImplementation()
    f.transport.createCheckout.mockImplementationOnce(async body => ({ ...await create(body) }))
    const retrieve = f.transport.retrieveCheckout.getMockImplementation()
    f.transport.retrieveCheckout.mockImplementation(async () => ({ ...await retrieve(), [key]: 'wrong' }))
    await f.worker().run()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
    expect(f.finalizer.reconcile).not.toHaveBeenCalled()
  })
  it('never treats provider lookup errors as permission to create', async () => {
    const f = setup()
    f.transport.listCheckouts.mockRejectedValueOnce(new Error('timeout'))
    await f.worker().run()
    expect(f.transport.createCheckout).not.toHaveBeenCalled()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
  })
  it('does not charge with an unverified instrument', async () => {
    const f = setup()
    f.transport.listPaymentInstruments.mockResolvedValue([{ token: 'different-token' }])
    await f.worker().run()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
  })
  it('does not reprocess an existing pending provider checkout', async () => {
    const f = setup()
    await f.transport.createCheckout({ amount: 19, currency: 'SEK', customer_id: f.row.customerId,
      merchant_code: 'MERCHANT1', checkout_reference: renewalReference(f.row.subscriptionId, f.row.periodEnd), purpose: 'CHECKOUT' })
    await f.worker().run()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
  })
  it('stops when eligibility changes immediately before payment', async () => {
    const f = setup()
    f.store.bind.mockResolvedValueOnce({ bound: true }).mockRejectedValueOnce(new Error('cancelled'))
    await f.worker().run()
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
  })
  it('finalizes verified failures without granting access', async () => {
    const f = setup()
    const create = f.transport.createCheckout.getMockImplementation()
    f.transport.createCheckout.mockImplementationOnce(async body => ({ ...await create(body) }))
    const retrieve = f.transport.retrieveCheckout.getMockImplementation()
    f.transport.retrieveCheckout.mockImplementation(async () => ({ ...await retrieve(), status: 'FAILED' }))
    expect((await f.worker().run()).results[0].outcome).toBe('failed')
    expect(f.transport.processCheckout).not.toHaveBeenCalled()
    expect(f.finalizer.reconcile).not.toHaveBeenCalled()
    expect(f.finalizer.recordFailed).toHaveBeenCalledOnce()
  })
})
