import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const source = code(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'quotaRead.js'), 'utf8'))
const subscriptionSource = code(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'subscriptionRead.js'), 'utf8'))
const route = code(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../billing/user/index.js'), 'utf8'))

describe('BILL-7X1 read adapters stay non-mutating', () => {
  it('does not call reserve_quota or write quota locks', () => {
    expect(source).not.toMatch(/reserve_quota|commit_quota|rollback_quota|quota_period_locks/)
    expect(source).toMatch(/summarizeQuotaReservations/)
    expect(subscriptionSource).not.toMatch(/provider_customer_ref|provider_subscription_ref|external_event_id/)
    expect(route).not.toMatch(/createSubscriptionAuthority|createQuotaEngine|inspectServerQuota|getServerSubscription/)
  })
})
