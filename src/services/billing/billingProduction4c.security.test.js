import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const runner = readFileSync(join(root, 'scripts/run-billing-production-4c.mjs'), 'utf8')

describe('BILL-4C production runner contract', () => {
  it('uses production env only and the staging-verified checksum', () => {
    expect(runner).toMatch(/\.env\.production\.local/)
    expect(runner).toMatch(/BILLING_PROD_DATABASE_URL/)
    expect(runner).not.toMatch(/BILLING_TEST_DATABASE_URL/)
    expect(runner).toMatch(/67d4de0f061477bacb52646fca6195d6eec94ec7/)
    expect(runner).toMatch(/20260922000000_billing_cost_safety\.sql/)
    expect(runner).toMatch(/threshold_count/)
    expect(runner).not.toMatch(/insert into billing\.cost_thresholds/)
    expect(runner).not.toMatch(/create_cost_threshold\(\$1/)
  })
})
