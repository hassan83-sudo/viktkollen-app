import { createSumUpRenewalAuthorityFromSql } from './sumupRenewalAuthorityFromSql.js'
import { createSumUpVerifiedSettlementService } from './sumupVerifiedSettlementService.js'
import { createVerifiedSumUpRenewalCommitBoundary } from './sumupVerifiedCommitBoundary.js'
import { createSumUpRenewalFinalizer } from './sumupRenewalFinalizer.js'

/**
 * Server-only composition. Requires externally provisioned restricted SQL
 * read and write capabilities. No credentials, routes, or charging cron.
 */
export function createSumUpRenewalSettlementPipeline({
  executeReadOnly, transport, restrictedWriter, merchantCode,
} = {}) {
  const renewalAuthority = createSumUpRenewalAuthorityFromSql({ executeReadOnly })
  const settlementService = createSumUpVerifiedSettlementService({
    transport, restrictedWriter, renewalAuthority, merchantCode,
  })
  const verifiedCommitPort = createVerifiedSumUpRenewalCommitBoundary({ settlementService })
  return createSumUpRenewalFinalizer({ verifiedCommitPort })
}
