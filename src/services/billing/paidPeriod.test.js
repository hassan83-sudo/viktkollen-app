import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { planIdForOpenPeriod } from './paidPeriod.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const migrations = join(root, 'supabase/migrations')
const quotaSql = readFileSync(join(migrations, '20261026130000_billing_quota_respects_period_end.sql'), 'utf8')
const checkoutSql = readFileSync(join(migrations, '20261026120000_billing_sumup_hosted_one_time.sql'), 'utf8')

describe('utgången betald period', () => {
  it('behåller en öppen period och faller tillbaka till gratisplanen när perioden är slut', () => {
    const now = new Date('2026-05-15T12:00:00.000Z')
    expect(planIdForOpenPeriod({
      assignedPlanId: 'plan.prelim.sek.month.04',
      now,
      periodEnd: '2026-05-16T12:00:00.000Z',
    })).toBe('plan.prelim.sek.month.04')
    expect(planIdForOpenPeriod({
      assignedPlanId: 'plan.prelim.sek.month.04',
      now,
      periodEnd: '2026-05-15T12:00:00.000Z',
    })).toBe('plan.free')
    expect(planIdForOpenPeriod({
      assignedPlanId: 'plan.prelim.sek.month.04',
      now,
      periodEnd: 'not-a-date',
    })).toBe('plan.free')
  })

  it('låter reservationen läsa periodens slut och säljer inte planen i migrationen', () => {
    expect(quotaSql).toMatch(/function billing\.open_paid_plan_id\(p_user_id uuid, p_assigned_plan_id text\)/)
    expect(quotaSql).toMatch(/s\.status in \('TRIALING', 'ACTIVE', 'PAST_DUE'\)/)
    expect(quotaSql).toMatch(/s\.current_period_end > pg_catalog\.now\(\)/)
    expect(quotaSql).toMatch(/billing\.open_paid_plan_id\(p_user_id, v_plan\.plan_id\) = 'plan\.free'/)
    expect(quotaSql).toMatch(/grant execute on function billing\.open_paid_plan_id\(uuid, text\) to service_role/)
    expect(quotaSql).not.toMatch(/enabled_for_sale\s*=\s*true/)
    expect(quotaSql).not.toMatch(/update billing\.subscriptions/i)
    expect(checkoutSql).not.toMatch(/enabled_for_sale\s*=\s*true/)
    const sold = readdirSync(migrations).filter((name) => {
      const text = readFileSync(join(migrations, name), 'utf8')
      return /enabled_for_sale\s*=\s*true/i.test(text)
    })
    expect(sold).toEqual([])
  })
})
