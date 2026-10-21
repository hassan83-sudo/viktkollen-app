/**
 * A read-only, deny-by-default adapter for the renewal facts query.
 * The injected query must be a server-side restricted database reader.
 * It must never be exposed as a browser/client endpoint.
 */
export function createSumUpRenewalRecordLoader({ database } = {}) {
  if (typeof database?.readRenewalFacts !== 'function') {
    throw new Error('SUMUP_RENEWAL_RECORD_READER_UNAVAILABLE')
  }
  return async function loadRenewalRecord({ subscriptionId, periodEnd } = {}) {
    if (typeof subscriptionId !== 'string' || !subscriptionId ||
        typeof periodEnd !== 'string' || !Number.isFinite(Date.parse(periodEnd))) {
      throw new Error('INVALID_RENEWAL_RECORD_LOOKUP')
    }
    const record = await database.readRenewalFacts({ subscriptionId, periodEnd })
    if (!record || record.subscriptionId !== subscriptionId ||
        !Number.isFinite(Date.parse(record.periodEnd)) || Date.parse(record.periodEnd) !== Date.parse(periodEnd)) {
      throw new Error('SUMUP_RENEWAL_RECORD_NOT_FOUND')
    }
    return record
  }
}
