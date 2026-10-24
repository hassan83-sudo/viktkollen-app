import { it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createSumUpRenewalWorker } from './sumupRenewalWorker.js'
import { createSumUpRenewalWorkerDatabase } from './sumupRenewalWorkerDatabase.js'
import { createSumUpRestrictedRenewalSettlementPipeline } from './sumupRestrictedRenewalSettlementPipeline.js'
import { instrumentFingerprint } from './sumupRecurring.js'

it('runs actual claim, bind, facts reader and atomic commit SQL through the worker (provider and period advance stubbed)', async () => {
  const db = new PGlite()
  try {
    for (const file of [
      'tests/billing/sumup-renewal-postgres-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-commit-bootstrap.sql',
      'supabase/migrations/20261024065246_sumup_renewal_facts_draft.sql',
      'supabase/migrations/20261024065249_sumup_renewal_snapshot_guard_draft.sql',
      'supabase/migrations/20261024065251_sumup_renewal_checkout_uniqueness_draft.sql',
      'supabase/migrations/20261024065319_sumup_renewal_claim_draft.sql',
      'supabase/migrations/20261024100000_sumup_renewal_bind_checkout_draft.sql',
      'supabase/migrations/20261024071558_sumup_renewal_worker_draft.sql',
      'supabase/migrations/20261024065322_sumup_renewal_commit_draft.sql',
      'supabase/migrations/20261024065325_sumup_renewal_facts_reader_draft.sql',
    ]) await db.exec(await readFile(file, 'utf8'))
    const token = 'temporary-server-token'
    await db.query('update billing.sumup_recurring_instruments set instrument_fingerprint = $1', [instrumentFingerprint(token)])
    const executor = { execute: ({ text, values }) => db.query(text, values) }
    let checkout
    const transport = {
      listCheckouts: vi.fn(async () => checkout ? [checkout] : []),
      createCheckout: vi.fn(async body => (checkout = { ...body, id: '00000000-0000-4000-8000-000000000001', status: 'PENDING' })),
      retrieveCheckout: vi.fn(async () => checkout),
      listPaymentInstruments: vi.fn(async () => [{ token }]),
      processCheckout: vi.fn(async () => {
        checkout = { ...checkout, status: 'PAID', transactions: [{ id: '00000000-0000-4000-8000-000000000002',
          status: 'SUCCESSFUL', amount: 19, currency: 'SEK' }] }
      }),
    }
    const store = createSumUpRenewalWorkerDatabase({ executor })
    const finalizer = createSumUpRestrictedRenewalSettlementPipeline({ executor, transport, merchantCode: 'MERCHANT1' })
    const makeWorker = () => createSumUpRenewalWorker({ store, finalizer, transport, merchantCode: 'MERCHANT1' })
    expect((await makeWorker().run()).results).toEqual([{ subscriptionId: 'sub-1', outcome: 'paid' }])
    expect((await db.query('select status, expected_amount_minor from billing.sumup_renewal_attempts')).rows[0])
      .toMatchObject({ status: 'succeeded', expected_amount_minor: 1900 })
    expect((await db.query('select current_period_end from billing.subscriptions')).rows[0].current_period_end.toISOString())
      .toBe('2026-11-01T00:00:00.000Z')
    expect(await makeWorker().run()).toEqual({ considered: 0, results: [] })
    expect(transport.processCheckout).toHaveBeenCalledOnce()
  } finally { await db.close() }
}, 20000)
