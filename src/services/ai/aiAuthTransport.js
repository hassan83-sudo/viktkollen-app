import { getCurrentAuthSession } from '../authService.js'

export const aiAuthErrorCode = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_STALE: 'AUTH_STALE',
  AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
}

export function getAiAuthSafeMessage(code) {
  const messages = {
    [aiAuthErrorCode.AUTH_REQUIRED]: 'Logga in för att använda remote AI.',
    [aiAuthErrorCode.AUTH_STALE]: 'Sessionen ändrades under AI-anropet. Försök igen.',
    [aiAuthErrorCode.AUTH_UNAVAILABLE]: 'Inloggningen kunde inte kontrolleras just nu.',
  }

  return messages[code] || 'Remote AI kunde inte användas säkert.'
}

export async function getCurrentAiAuthorization() {
  const { data, error } = await getCurrentAuthSession()
  if (error) {
    return {
      errorCode: aiAuthErrorCode.AUTH_UNAVAILABLE,
      ok: false,
      warning: getAiAuthSafeMessage(aiAuthErrorCode.AUTH_UNAVAILABLE),
    }
  }

  const session = data?.session
  if (!session?.access_token) {
    return {
      errorCode: aiAuthErrorCode.AUTH_REQUIRED,
      ok: false,
      warning: getAiAuthSafeMessage(aiAuthErrorCode.AUTH_REQUIRED),
    }
  }

  return {
    authorizationHeader: `Bearer ${session.access_token}`,
    ok: true,
    userScope: session.user?.id || '',
  }
}

export async function hasSameAiAuthUser(userScope) {
  const { data } = await getCurrentAuthSession()
  return Boolean(userScope && data?.session?.user?.id === userScope)
}
