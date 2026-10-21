import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalFinalizer } from './sumupRenewalFinalizer.js'

const checkout = {
  id: 'checkout-1',
  checkout_reference: 'rn123',
  customer_id: 'vk123',
  merchant_code: 'MERCHANT',
  currency: 'SEK',
  amount: 19,
  status: 'PAID',
    transactions: [{ id: '123e4567-e89b-12d3-a456-426614174000', status: 'SUCCESSFUL', currency: 'SEK', amount: 19 }],
}
const args = {
  providerCheckoutId: checkout.id,
  checkoutReference: checkout.checkout_reference,
  subscriptionId: 'sub-1',
  periodEnd: '2026-10-01T00:00:00Z',
  nextPeriodEnd: '2026-11-01T00:00:00Z',
  customerId: checkout.customer_id,
  merchantCode: checkout.merchant_code,
  amountMinor: 1900,
}
function setup(checkoutResult = checkout, dbResult = { data: { committed: true, already_committed: false }, error: null }) {
  const retrieveCheckout = vi.fn().mockResolvedValue(checkoutResult)
  const rpc = vi.fn().mockResolvedValue(dbResult)
  return { retrieveCheckout, rpc, finalizer: createSumUpRenewalFinalizer({
    transport: { retrieveCheckout },
    client: { schema: vi.fn().mockReturnValue({ rpc }) },
  }) }
}
describe('SumUp renewal finalizer', () => {
  it('commits only a verified paid checkout', async () => {
    const { finalizer, rpc } = setup()
    await expect(finalizer.reconcile(args)).resolves.toEqual({
      committed: true, outcome: 'paid', alreadyCommitted: false,
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('does not commit pending payments', async () => {
    const { finalizer, rpc } = setup({ ...checkout, status: 'PENDING' })
    expect((await finalizer.reconcile(args)).outcome).toBe('pending')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not commit mismatched checkouts', async () => {
    const { finalizer, rpc } = setup({ ...checkout, amount: 29 })
    expect((await finalizer.reconcile(args)).outcome).toBe('mismatch')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not commit after a provider timeout', async () => {
    const { finalizer, rpc, retrieveCheckout } = setup()
    retrieveCheckout.mockRejectedValue(new Error('timeout'))
    expect((await finalizer.reconcile(args)).outcome).toBe('pending')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('fails closed on a database error', async () => {
    const { finalizer } = setup(checkout, { data: null, error: { message: 'db failure' } })
    await expect(finalizer.reconcile(args)).rejects.toThrow('SUMUP_RENEWAL_COMMIT_FAILED')
  })
})
