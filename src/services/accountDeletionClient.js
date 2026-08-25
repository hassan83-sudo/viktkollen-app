import { getCurrentAiAuthorization } from './ai/aiAuthTransport.js'
import {
  getDeletionStorageKeys,
  removeUserData,
  userDataKeys,
} from './userDataRepository.js'

const endpoint = '/api/account-deletion'

export function getLocalDeletionKeys() {
  return [...new Set([
    ...getDeletionStorageKeys(),
    userDataKeys.cloudBackupMeta,
    userDataKeys.demoMode,
    userDataKeys.profilePhoto,
  ])].filter(Boolean)
}

export function clearLocalViktkollenData(keys = getLocalDeletionKeys()) {
  const results = keys.map((key) => ({
    key,
    ok: removeUserData(key),
  }))

  return {
    failedKeys: results.filter((result) => !result.ok).map((result) => result.key),
    ok: results.every((result) => result.ok),
    removedKeys: results.filter((result) => result.ok).map((result) => result.key),
  }
}

export async function requestAccountDeletion({
  fetchImpl = fetch,
  mode = 'dry-run',
} = {}) {
  const auth = await getCurrentAiAuthorization()
  if (!auth.ok || !auth.authorizationHeader) {
    return {
      error: {
        code: auth.errorCode || 'AUTH_REQUIRED',
        safeMessage: auth.warning || 'Logga in igen innan kontodata kan raderas.',
      },
      ok: false,
    }
  }

  try {
    const response = await fetchImpl(endpoint, {
      body: JSON.stringify({ mode }),
      headers: {
        Authorization: auth.authorizationHeader,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || payload?.ok === false) {
      return {
        error: payload?.error || {
          code: `HTTP_${response.status}`,
          safeMessage: 'Kontoradering kunde inte slutföras säkert.',
        },
        ok: false,
        summary: payload?.summary || null,
      }
    }

    return {
      ok: true,
      readiness: payload.readiness || null,
      summary: payload.summary || null,
    }
  } catch {
    return {
      error: {
        code: 'NETWORK_FAILURE',
        safeMessage: 'Kontoradering kunde inte nå servern just nu.',
      },
      ok: false,
    }
  }
}
