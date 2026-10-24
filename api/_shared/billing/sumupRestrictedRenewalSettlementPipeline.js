import { createSumUpRenewalFailureService } from './sumupRenewalFailureService.js'
import { createSumUpRenewalAuthorityFromSql } from './sumupRenewalAuthorityFromSql.js'
import { createSumUpRenewalSettlementPipeline } from './sumupRenewalSettlementPipeline.js'
import { createSumUpRestrictedRenewalDatabase } from './sumupRestrictedRenewalDatabase.js'

/**
 * Composes the complete verified settlement pipeline using the restricted
 * PostgreSQL executor. Does not create credentials, schedule renewals, or
 * enable charging by itself.
 */
export function createSumUpRestrictedRenewalSettlementPipeline({
  executor, transport, merchantCode,
} = {}) {
  const { restrictedWriter } = createSumUpRestrictedRenewalDatabase({ executor })
  const executeReadOnly = async ({ subscriptionId, periodEnd } = {}) => {
    const result = await executor.execute({
      text: 'select * from billing.read_sumup_renewal_facts_draft($1, $2::timestamptz)',
      values: [subscriptionId, periodEnd],
    })
    return result?.rows
  }
  const finalizer = createSumUpRenewalSettlementPipeline({
    executeReadOnly, transport, restrictedWriter, merchantCode,
  })
  const failureService = createSumUpRenewalFailureService({
    executor, transport, merchantCode,
    renewalAuthority: createSumUpRenewalAuthorityFromSql({ executeReadOnly }),
  })
  return { ...finalizer, recordFailed: failureService.recordFailed }
}
