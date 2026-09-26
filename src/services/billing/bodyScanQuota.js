import { QUOTA_STATUS } from './catalog.js'
import { getCurrentAiAuthorization } from '../ai/aiAuthTransport.js'

const BODY_SCAN_QUOTA_PATH = '/api/billing/quota?feature=body.scan&unit=requests'

export const unavailableBodyScanQuota = Object.freeze({
  allowed: false,
  limit: null,
  remaining: null,
  status: 'unavailable',
  used: null,
})

export function interpretBodyScanQuota(quota) {
  const used = Number.isFinite(quota?.used) ? quota.used : null
  const limit = Number.isFinite(quota?.limit) ? quota.limit : null
  const remaining = Number.isFinite(quota?.remaining) ? quota.remaining : null
  const allowed = quota?.status === QUOTA_STATUS.ALLOWED && remaining !== null && remaining > 0
  return {
    allowed,
    limit,
    remaining,
    status: quota?.status || 'unavailable',
    used,
  }
}

export async function loadBodyScanQuota({
  fetchImpl = fetch,
  getAuthorization = getCurrentAiAuthorization,
} = {}) {
  const auth = await getAuthorization?.()
  if (!auth?.ok || !auth.authorizationHeader) {
    return { ok: false, quota: unavailableBodyScanQuota, reason: auth?.errorCode || 'AUTH_REQUIRED' }
  }

  try {
    const response = await fetchImpl(BODY_SCAN_QUOTA_PATH, {
      headers: { Authorization: auth.authorizationHeader },
      method: 'GET',
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.ok === false || !payload?.quota) {
      return { ok: false, quota: unavailableBodyScanQuota, reason: 'INSPECT_FAILED' }
    }
    return { ok: true, quota: interpretBodyScanQuota(payload.quota), reason: '' }
  } catch {
    return { ok: false, quota: unavailableBodyScanQuota, reason: 'INSPECT_FAILED' }
  }
}
