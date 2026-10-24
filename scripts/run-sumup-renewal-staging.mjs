/** Explicit, manual Staging-only runner. No scheduler or production fallback. */
import { createRestrictedSumUpDatabaseExecutor } from '../api/_shared/billing/sumupRestrictedDatabaseExecutor.js'
import { createSumUpRenewalWorkerDatabase } from '../api/_shared/billing/sumupRenewalWorkerDatabase.js'
import { createSumUpRenewalWorker } from '../api/_shared/billing/sumupRenewalWorker.js'
import { createSumUpRestrictedRenewalSettlementPipeline } from '../api/_shared/billing/sumupRestrictedRenewalSettlementPipeline.js'
import { createSumUpHttpTransport } from '../api/_shared/billing/providers/sumup.js'

// Deliberately separate from general SUMUP_API_KEY / DATABASE_URL.
const env = process.env
if (env.SUMUP_RENEWAL_STAGING_ENABLED !== 'true' ||
    env.SUMUP_RENEWAL_STAGING_PROJECT_REF !== 'armtslzspuebmlysnooq' ||
    !env.SUMUP_RENEWAL_STAGING_API_KEY || !env.SUMUP_RENEWAL_STAGING_MERCHANT_CODE ||
    !env.SUMUP_RENEWAL_STAGING_DATABASE_URL || env.VERCEL_ENV === 'production') {
  throw new Error('SUMUP_RENEWAL_STAGING_NOT_CONFIGURED')
}
const target = new URL(env.SUMUP_RENEWAL_STAGING_DATABASE_URL)
if (target.hostname !== 'db.armtslzspuebmlysnooq.supabase.co' &&
    !(target.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(target.username).endsWith('.armtslzspuebmlysnooq'))) {
  throw new Error('SUMUP_RENEWAL_STAGING_DATABASE_MISMATCH')
}
const executor = createRestrictedSumUpDatabaseExecutor({ connectionString: env.SUMUP_RENEWAL_STAGING_DATABASE_URL })
try {
  const merchantCode = env.SUMUP_RENEWAL_STAGING_MERCHANT_CODE
  const transport = createSumUpHttpTransport({ apiKey: env.SUMUP_RENEWAL_STAGING_API_KEY })
  const merchant = await transport.retrieveMerchant(merchantCode)
  // Sandbox identity must be verified by SumUp, never by a caller's label.
  if (merchant?.merchant_code !== merchantCode || merchant?.sandbox !== true) {
    throw new Error('SUMUP_RENEWAL_SANDBOX_MERCHANT_REQUIRED')
  }
  const finalizer = createSumUpRestrictedRenewalSettlementPipeline({ executor, transport, merchantCode })
  const store = createSumUpRenewalWorkerDatabase({ executor })
  const result = await createSumUpRenewalWorker({ store, transport, finalizer, merchantCode }).run()
  console.log(JSON.stringify(result))
} catch {
  console.error('SUMUP_RENEWAL_STAGING_FAILED')
  process.exitCode = 1
} finally {
  await executor.close()
}
