import { it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createSumUpRenewalWorker } from './sumupRenewalWorker.js'
import { createSumUpRenewalWorkerDatabase } from './sumupRenewalWorkerDatabase.js'
import { createSumUpRestrictedRenewalSettlementPipeline } from './sumupRestrictedRenewalSettlementPipeline.js'
import { instrumentFingerprint } from './sumupRecurring.js'

it.each(['PAID', 'FAILED', 'EXPIRED'])('runs pending-plan worker %s through actual SQL lifecycle (provider mocked)', async outcome => {
  const db = new PGlite()
  try {
    for (const file of [
      'tests/billing/sumup-renewal-postgres-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-commit-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-failure-bootstrap.sql',
      'tests/billing/sumup-renewal-postgres-pending-bootstrap.sql',
      'supabase/migrations/20260924084000_billing_pending_plan_apply.sql',
      'supabase/migrations/20260926140000_billing_mark_renewal_failed.sql',
      'supabase/migrations/20261024082822_sumup_renewal_failure_draft.sql',
      'supabase/migrations/20261024065246_sumup_renewal_facts_draft.sql',
      'supabase/migrations/20261024065249_sumup_renewal_snapshot_guard_draft.sql',
      'supabase/migrations/20261024065251_sumup_renewal_checkout_uniqueness_draft.sql',
      'supabase/migrations/20261024065319_sumup_renewal_claim_draft.sql',
      'supabase/migrations/20261024082853_sumup_renewal_bind_checkout_draft.sql',
      'supabase/migrations/20261024082814_sumup_renewal_worker_draft.sql',
      'supabase/migrations/20261024065322_sumup_renewal_commit_draft.sql',
      'supabase/migrations/20261024065325_sumup_renewal_facts_reader_draft.sql',
      'supabase/migrations/20261024083536_sumup_renewal_pending_plan_draft.sql',
    ]) await db.exec(await readFile(file, 'utf8'))
    await db.exec("insert into billing.plans values ('plan-next', 900, 'SEK', 2, true); update billing.subscriptions set pending_plan_id = 'plan-next', pending_plan_change = 'next_period'")
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
        checkout = { ...checkout, status: outcome, transactions: outcome === 'PAID' ? [{ id: '00000000-0000-4000-8000-000000000002',
          status: 'SUCCESSFUL', amount: 9, currency: 'SEK' }] : [] }
      }),
    }
    const store = createSumUpRenewalWorkerDatabase({ executor })
    const finalizer = createSumUpRestrictedRenewalSettlementPipeline({ executor, transport, merchantCode: 'MERCHANT1' })
    const makeWorker = () => createSumUpRenewalWorker({ store, finalizer, transport, merchantCode: 'MERCHANT1' })
    expect((await makeWorker().run()).results).toEqual([{ subscriptionId: 'sub-1', outcome: outcome === 'PAID' ? 'paid' : 'failed' }])
    expect((await db.query('select status, expected_amount_minor from billing.sumup_renewal_attempts')).rows[0])
      .toMatchObject({ status: outcome === 'PAID' ? 'succeeded' : 'failed', expected_amount_minor: 900 })
    expect((await db.query('select current_period_end from billing.subscriptions')).rows[0].current_period_end.toISOString())
      .toBe(outcome === 'PAID' ? '2026-11-01T00:00:00.000Z' : '2026-10-01T00:00:00.000Z')
    if (outcome !== 'PAID') {
      expect((await db.query('select status, past_due_grace_until from billing.subscriptions')).rows[0])
        .toMatchObject({ status: 'PAST_DUE', past_due_grace_until: new Date('2026-10-08T00:00:00Z') })
      expect((await db.query("select count(*)::integer as count from billing.subscription_events where operation = 'renewal.failed'")).rows[0].count).toBe(1)
    }
    expect(transport.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: 9 }))
    expect((await db.query('select plan_id, plan_version, pending_plan_id from billing.subscriptions')).rows[0])
      .toMatchObject(outcome === 'PAID' ? { plan_id: 'plan-next', plan_version: 2, pending_plan_id: null }
        : { plan_id: 'plan-1', plan_version: 1, pending_plan_id: 'plan-next' })
    expect(await makeWorker().run()).toEqual({ considered: 0, results: [] })
    expect(transport.processCheckout).toHaveBeenCalledOnce()
  } finally { await db.close() }
}, 20000)
