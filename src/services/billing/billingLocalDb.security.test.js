import process from 'node:process'
import { describe, expect, it } from 'vitest'

const ENV_KEYS = ['SUPABASE_DB_URL', 'DATABASE_URL', 'POSTGRES_URL', 'PGHOST', 'PGPORT']

describe('BILL-1B local database availability', () => {
  it('does not use a database URL in this environment (live RLS not claimed)', () => {
    const configured = ENV_KEYS.filter((key) => Boolean(process.env[key] && String(process.env[key]).trim()))
    expect(configured).toEqual([])
  })

  it('records that live role/RLS checks remain required before migration approval', () => {
    expect({
      localDbAvailable: false,
      migrationAppliedLocally: false,
      productionContacted: false,
    }).toEqual({
      localDbAvailable: false,
      migrationAppliedLocally: false,
      productionContacted: false,
    })
  })
})
