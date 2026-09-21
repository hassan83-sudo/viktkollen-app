import { createQuotaEngine } from '../../../src/services/billing/quotaEngine.js'
import { QUOTA_STATUS } from '../../../src/services/billing/catalog.js'

const engine = createQuotaEngine()

export async function inspectServerQuota({
  feature,
  unit,
  user,
} = {}) {
  return engine.inspectQuota({
    clientClaim: {},
    feature,
    unit,
    userId: user?.id || '',
  })
}

export async function reserveServerQuota({
  feature,
  quantity,
  unit,
  user,
} = {}) {
  return engine.reserveQuota({
    clientClaim: {},
    feature,
    quantity,
    unit,
    user,
  })
}

export { QUOTA_STATUS }
