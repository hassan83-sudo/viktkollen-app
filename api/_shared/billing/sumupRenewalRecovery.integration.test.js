import { it, expect, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createSumUpRenewalRecovery, createSumUpRenewalRecoveryDatabase } from './sumupRenewalRecovery.js'
import { createSumUpRestrictedRenewalSettlementPipeline } from './sumupRestrictedRenewalSettlementPipeline.js'

it.each(['paid', 'failed', 'terminal', 'cancelled', 'changed_plan', 'advanced_period', 'pending', 'unbound', 'unavailable', 'mismatch', 'settlement_error'])(
  'recovers original attempt: %s (actual SQL, provider mocked)', async scenario => {
    const db = new PGlite()
    try {
      for (const file of [
        'tests/billing/sumup-renewal-postgres-bootstrap.sql',
        'tests/billing/sumup-renewal-postgres-commit-bootstrap.sql',
        'tests/billing/sumup-renewal-postgres-failure-bootstrap.sql',
        'tests/billing/sumup-renewal-postgres-pending-bootstrap.sql',
        'tests/billing/sumup-renewal-postgres-recovery-bootstrap.sql',
        'supabase/migrations/20260924084000_billing_pending_plan_apply.sql',
        'supabase/migrations/20260926140000_billing_mark_renewal_failed.sql',
        'supabase/migrations/20261024065246_sumup_renewal_facts_draft.sql',
        'supabase/migrations/20261024065249_sumup_renewal_snapshot_guard_draft.sql',
        'supabase/migrations/20261024065251_sumup_renewal_checkout_uniqueness_draft.sql',
        'supabase/migrations/20261024065319_sumup_renewal_claim_draft.sql',
        'supabase/migrations/20261024065322_sumup_renewal_commit_draft.sql',
        'supabase/migrations/20261024065325_sumup_renewal_facts_reader_draft.sql',
        'supabase/migrations/20261024075008_sumup_renewal_failure_draft.sql',
        'supabase/migrations/20261024100000_sumup_renewal_bind_checkout_draft.sql',
        'supabase/migrations/20261024100001_sumup_renewal_pending_plan_draft.sql',
        'supabase/migrations/20261024100002_sumup_renewal_recovery_draft.sql',
      ]) await db.exec(await readFile(file, 'utf8'))
      await db.exec("select billing.claim_sumup_renewal_attempt('original-ref','sub-1','2026-10-01Z')")
      if (scenario !== 'unbound') await db.query(
        'select billing.bind_sumup_renewal_checkout_draft($1,$2,$3,$4,$5)',
        ['original-ref','00000000-0000-4000-8000-000000000001','sub-1','2026-10-01Z','2026-11-01Z'])
      if (scenario === 'terminal') await db.exec("update billing.subscriptions set status = 'CANCELED'")
      if (scenario === 'cancelled') await db.exec('update billing.subscriptions set cancel_at_period_end = true')
      if (scenario === 'changed_plan') await db.exec("insert into billing.plans values ('other-plan',1900,'SEK',2,true); update billing.subscriptions set pending_plan_id='other-plan',pending_plan_change='next_period'")
      if (scenario === 'advanced_period') await db.exec("update billing.subscriptions set current_period_end='2026-11-01Z'")
      const checkout = { id: '00000000-0000-4000-8000-000000000001', checkout_reference: 'original-ref',
        customer_id: scenario === 'mismatch' ? 'wrong' : 'customer-1', merchant_code: 'MERCHANT1', amount: 19,
        currency: 'SEK', status: scenario === 'pending' ? 'PENDING' : scenario === 'failed' ? 'FAILED' : 'PAID',
        transactions: ['pending','failed'].includes(scenario) ? [] : [{ id: '00000000-0000-4000-8000-000000000002',
          status: 'SUCCESSFUL', amount: 19, currency: 'SEK' }] }
      const transport = {
        retrieveCheckout: vi.fn(async () => { if (scenario === 'unavailable') throw new Error('timeout'); return checkout }),
        createCheckout: vi.fn(), processCheckout: vi.fn(),
      }
      const executor = { execute: ({ text, values }) => db.query(text, values) }
      const store = createSumUpRenewalRecoveryDatabase({ executor })
      const finalizer = createSumUpRestrictedRenewalSettlementPipeline({ executor, transport, merchantCode: 'MERCHANT1' })
      if (scenario === 'settlement_error') finalizer.reconcile = vi.fn(async () => { throw new Error('write unavailable') })
      const run = () => createSumUpRenewalRecovery({ store, transport, finalizer, merchantCode: 'MERCHANT1' }).run()
      const result = await run()
      expect(result.results[0].outcome).toBe(scenario === 'paid' ? 'paid' : scenario === 'failed' ? 'failed' : scenario === 'pending' ? 'pending' : 'review_required')
      const attempt = (await db.query('select * from billing.sumup_renewal_attempts')).rows[0]
      expect(attempt.observed_outcome).toBe(['unbound','unavailable','mismatch'].includes(scenario) ? 'unknown' : scenario === 'pending' ? 'pending' : scenario === 'failed' ? 'failed' : 'paid')
      expect(attempt.recovery_state).toBe(['paid','failed'].includes(scenario) ? 'settled' : scenario === 'pending' ? 'pending' : 'review_required')
      if (attempt.observed_outcome === 'paid') expect(attempt.observed_transaction_id).toBe(checkout.transactions[0].id)
      if (['paid','failed'].includes(scenario)) {
        expect(attempt.status).toBe(scenario === 'paid' ? 'succeeded' : 'failed')
        expect(await run()).toEqual({ considered: 0, results: [] })
      } else {
        expect(attempt.status).toBe('processing')
        const subscription = (await db.query('select * from billing.subscriptions')).rows[0]
        expect(subscription.plan_id).toBe('plan-1')
        expect(subscription.current_period_end.toISOString()).toBe(scenario === 'advanced_period' ? '2026-11-01T00:00:00.000Z' : '2026-10-01T00:00:00.000Z')
        expect((await db.query('select count(*)::int as count from billing.subscription_events')).rows[0].count).toBe(0)
        await run() // A restart cannot create a new checkout or charge.
      }
      expect(transport.createCheckout).not.toHaveBeenCalled()
      expect(transport.processCheckout).not.toHaveBeenCalled()
    } finally { await db.close() }
  }, 20000,
)
