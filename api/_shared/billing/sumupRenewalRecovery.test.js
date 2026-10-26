import { it, expect, vi } from 'vitest'
import { createSumUpRenewalRecovery } from './sumupRenewalRecovery.js'

it('reports an unresolved attempt if the database cannot persist review, without settling or charging', async () => {
  const store = { list: async () => [{ subscriptionId: 'sub', providerCheckoutId: '' }], record: vi.fn(async () => { throw new Error('database offline') }) }
  const transport = { retrieveCheckout: vi.fn(), createCheckout: vi.fn(), processCheckout: vi.fn() }
  const finalizer = { reconcile: vi.fn(), recordFailed: vi.fn() }
  const result = await createSumUpRenewalRecovery({ store, transport, finalizer, merchantCode: 'merchant' }).run()
  expect(result.results).toEqual([{ subscriptionId: 'sub', outcome: 'reconciliation_required' }])
  expect(transport.retrieveCheckout).not.toHaveBeenCalled()
  expect(transport.createCheckout).not.toHaveBeenCalled()
  expect(transport.processCheckout).not.toHaveBeenCalled()
  expect(finalizer.reconcile).not.toHaveBeenCalled()
  expect(finalizer.recordFailed).not.toHaveBeenCalled()
})
