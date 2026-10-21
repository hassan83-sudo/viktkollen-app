import { describe, expect, it, vi } from 'vitest'
import { createRestrictedSumUpDatabaseExecutor } from './sumupRestrictedDatabaseExecutor.js'

const url = 'postgresql://renewal_worker:secret@db.example.test:5432/app?sslmode=require'

function makePool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ result: { committed: true, already_committed: false } }] }),
    end: vi.fn().mockResolvedValue(undefined),
  }
}

describe('restricted SumUp PostgreSQL executor', () => {
  it('requires an explicit dedicated database URL', () => {
    expect(() => createRestrictedSumUpDatabaseExecutor({ connectionString: '' }))
      .toThrow('SUMUP_RENEWAL_DATABASE_URL_MISSING')
  })

  it.each([
    'postgresql://postgres:secret@db.example.test:5432/app',
    'postgresql://service_role:secret@db.example.test:5432/app',
    'postgresql://renewal_worker:secret@localhost:5432/app',
  ])('rejects privileged or local connection target %s', connectionString => {
    expect(() => createRestrictedSumUpDatabaseExecutor({ connectionString, PoolClass: vi.fn() }))
      .toThrow('SUMUP_RENEWAL_DATABASE_ROLE_NOT_RESTRICTED')
  })

  it('enables certificate validation and executes parameterized approved RPCs', async () => {
    const pool = makePool()
    const PoolClass = vi.fn(() => pool)
    const db = createRestrictedSumUpDatabaseExecutor({ connectionString: url, PoolClass })
    expect(PoolClass).toHaveBeenCalledWith(expect.objectContaining({
      ssl: { rejectUnauthorized: true },
      max: 2,
      application_name: 'viktkollen-sumup-renewal',
    }))
    await expect(db.execute({
      text: 'select billing.commit_verified_sumup_renewal($1, $2, $3::timestamptz, $4, $5::timestamptz) as result',
      values: ['rn1', 'sub1', '2026-10-01T00:00:00Z', 'checkout1', '2026-11-01T00:00:00Z'],
    })).resolves.toMatchObject({ rows: [{ result: { committed: true } }] })
    expect(pool.query).toHaveBeenCalledTimes(1)
    await db.close()
    expect(pool.end).toHaveBeenCalledOnce()
  })

  it('blocks arbitrary SQL and sanitizes database errors', async () => {
    const pool = makePool()
    const db = createRestrictedSumUpDatabaseExecutor({ connectionString: url, PoolClass: vi.fn(() => pool) })
    await expect(db.execute({ text: 'delete from billing.subscriptions', values: [] }))
      .rejects.toThrow('SUMUP_RENEWAL_SQL_OPERATION_NOT_ALLOWED')
    pool.query.mockRejectedValueOnce(new Error('secret query details'))
    await expect(db.execute({
      text: 'select billing.commit_verified_sumup_renewal($1, $2, $3::timestamptz, $4, $5::timestamptz) as result',
      values: ['rn1', 'sub1', '2026-10-01T00:00:00Z', 'checkout1', '2026-11-01T00:00:00Z'],
    })).rejects.toThrow('SUMUP_RENEWAL_DATABASE_OPERATION_FAILED')
  })
})
