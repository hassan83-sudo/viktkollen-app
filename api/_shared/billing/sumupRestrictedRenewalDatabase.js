import { createSumUpRenewalAuthorityFromSql } from './sumupRenewalAuthorityFromSql.js'
import { createSumUpRenewalSqlWriter } from './sumupRenewalSqlWriter.js'

/**
 * Connects the renewal authority and settlement writer to the dedicated
 * restricted PostgreSQL executor. This creates no connection until configured
 * and does not grant database permissions or call SumUp.
 */
export function createSumUpRestrictedRenewalDatabase({ executor } = {}) {
  if (typeof executor?.execute !== 'function') {
    throw new Error('SUMUP_RENEWAL_DATABASE_EXECUTOR_UNAVAILABLE')
  }
  const executeReadOnly = async ({ subscriptionId, periodEnd } = {}) => {
    const result = await executor.execute({
      text: 'select * from billing.read_sumup_renewal_facts_draft($1, $2::timestamptz)',
      values: [subscriptionId, periodEnd],
    })
    return result?.rows
  }
  const renewalAuthority = createSumUpRenewalAuthorityFromSql({ executeReadOnly })
  const restrictedWriter = createSumUpRenewalSqlWriter({
    executeRestricted: args => executor.execute(args),
  })
  return { renewalAuthority, restrictedWriter }
}
