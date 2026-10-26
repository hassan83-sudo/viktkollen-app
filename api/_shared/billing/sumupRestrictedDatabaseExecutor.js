import { SUMUP_RECOVERY_SQL } from './sumupRenewalRecovery.js'
import { SUMUP_RENEWAL_FAILURE_SQL } from './sumupRenewalFailureService.js'
import { RENEWAL_WORKER_SQL } from './sumupRenewalWorkerDatabase.js'
import pg from 'pg'

const { Pool } = pg
const FORBIDDEN_USERS = new Set(['postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin'])

/**
 * Creates a server-only PostgreSQL executor for a separately provisioned
 * least-privilege login. Never use DATABASE_URL or Supabase service-role
 * credentials here. The database owner must grant only reviewed RPC access.
 */
export function createRestrictedSumUpDatabaseExecutor({
  connectionString = process.env.SUMUP_RENEWAL_DATABASE_URL,
  PoolClass = Pool,
} = {}) {
  if (typeof connectionString !== 'string' || !connectionString) {
    throw new Error('SUMUP_RENEWAL_DATABASE_URL_MISSING')
  }

  let parsed
  try {
    parsed = new URL(connectionString)
  } catch {
    throw new Error('SUMUP_RENEWAL_DATABASE_URL_INVALID')
  }
  const username = decodeURIComponent(parsed.username || '')
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !username || FORBIDDEN_USERS.has(username.toLowerCase()) ||
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    throw new Error('SUMUP_RENEWAL_DATABASE_ROLE_NOT_RESTRICTED')
  }

  const pool = new PoolClass({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    application_name: 'viktkollen-sumup-renewal',
  })

  return {
    async execute({ text, values } = {}) {
      if (typeof text !== 'string' ||
          !([
            'select billing.commit_verified_sumup_renewal($1, $2, $3::timestamptz, $4, $5::timestamptz) as result',
            'select * from billing.read_sumup_renewal_facts_draft($1, $2::timestamptz)',
            ...Object.values(RENEWAL_WORKER_SQL),
            SUMUP_RENEWAL_FAILURE_SQL,
            ...Object.values(SUMUP_RECOVERY_SQL),
          ].includes(text)) ||
          !Array.isArray(values)) {
        throw new Error('SUMUP_RENEWAL_SQL_OPERATION_NOT_ALLOWED')
      }
      try {
        const result = await pool.query({ text, values })
        return { rows: result.rows }
      } catch {
        // Never return database messages that may contain sensitive values.
        throw new Error('SUMUP_RENEWAL_DATABASE_OPERATION_FAILED')
      }
    },
    async close() {
      await pool.end()
    },
  }
}
