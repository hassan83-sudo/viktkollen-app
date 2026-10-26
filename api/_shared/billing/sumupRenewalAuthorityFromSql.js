import { createSumUpRenewalSqlReader } from './sumupRenewalSqlReader.js'
import { createSumUpRenewalFactsDatabase } from './sumupRenewalFactsDatabase.js'
import { createSumUpRenewalRecordLoader } from './sumupRenewalRecordLoader.js'
import { createSumUpRenewalAuthority } from './sumupRenewalAuthority.js'

/**
 * Composes the trusted renewal read chain. Does not grant database privileges,
 * run SQL, or create charges. executeReadOnly must be supplied by a reviewed
 * server-only database connection with access to the restricted facts query.
 */
export function createSumUpRenewalAuthorityFromSql({ executeReadOnly } = {}) {
  const query = createSumUpRenewalSqlReader({ executeReadOnly })
  const database = createSumUpRenewalFactsDatabase({ query })
  const loadRenewalRecord = createSumUpRenewalRecordLoader({ database })
  return createSumUpRenewalAuthority({ loadRenewalRecord })
}
