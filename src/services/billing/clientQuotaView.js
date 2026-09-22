/**
 * Client helper: display only. Never treat localStorage / DevTools as quota authority.
 */
export function readClientQuotaDisplay(serverQuota) {
  return {
    limit: serverQuota?.limit ?? null,
    remaining: serverQuota?.remaining ?? null,
    status: serverQuota?.status || 'DENIED_NO_USER',
    unit: serverQuota?.unit || null,
    used: serverQuota?.used ?? 0,
  }
}
