import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const runner = readFileSync(join(root, 'scripts/run-billing-staging-4c.mjs'), 'utf8')
const sql = readFileSync(join(root, 'supabase/migrations/20260922000000_billing_cost_safety.sql'), 'utf8')

describe('BILL-4C staging runner contract', () => {
  it('loads only gitignored staging .env.local and the 4C migration', () => {
    expect(runner).toMatch(/\.env\.local/)
    expect(runner).not.toMatch(/\.env\.production\.local/)
    expect(runner).toMatch(/20260922000000_billing_cost_safety\.sql/)
    expect(runner).toMatch(/hash-object/)
    expect(runner).toMatch(/TWO_REAL_POSTGRES_SESSIONS/)
    expect(sql).toMatch(/DO NOT apply to production/)
  })
})
