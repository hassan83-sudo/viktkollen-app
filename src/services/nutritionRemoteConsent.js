export const nutritionRemoteConsentVersion = 'nutrition-photo-remote-v1'
export const nutritionRemoteConsentStoragePrefix = 'viktkollen.nutritionRemoteAnalysisConsent'

function storageFromWindow(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function getNutritionRemoteConsentUserKey(userId) {
  return String(userId || 'local-user')
    .trim()
    .replace(/[^a-zA-Z0-9@._-]/g, '_')
    .slice(0, 120) || 'local-user'
}

export function getNutritionRemoteConsentStorageKey(userId) {
  return `${nutritionRemoteConsentStoragePrefix}.${getNutritionRemoteConsentUserKey(userId)}`
}

export function normalizeNutritionRemoteConsent(value, {
  version = nutritionRemoteConsentVersion,
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { granted: false, grantedAt: '', version }
  }

  const granted = value.granted === true && value.version === version && Boolean(value.grantedAt)

  return {
    granted,
    grantedAt: granted ? String(value.grantedAt) : '',
    version,
  }
}

export function readNutritionRemoteConsent(userId, {
  storage,
  version = nutritionRemoteConsentVersion,
} = {}) {
  const targetStorage = storageFromWindow(storage)
  if (!targetStorage) return normalizeNutritionRemoteConsent(null, { version })

  try {
    return normalizeNutritionRemoteConsent(
      JSON.parse(targetStorage.getItem(getNutritionRemoteConsentStorageKey(userId)) || 'null'),
      { version },
    )
  } catch {
    return normalizeNutritionRemoteConsent(null, { version })
  }
}

export function grantNutritionRemoteConsent(userId, {
  now = new Date().toISOString(),
  storage,
  version = nutritionRemoteConsentVersion,
} = {}) {
  const targetStorage = storageFromWindow(storage)
  const consent = { granted: true, grantedAt: now, version }
  if (!targetStorage) return normalizeNutritionRemoteConsent(null, { version })

  try {
    targetStorage.setItem(getNutritionRemoteConsentStorageKey(userId), JSON.stringify(consent))
    return consent
  } catch {
    return normalizeNutritionRemoteConsent(null, { version })
  }
}

export function revokeNutritionRemoteConsent(userId, {
  storage,
  version = nutritionRemoteConsentVersion,
} = {}) {
  const targetStorage = storageFromWindow(storage)
  if (!targetStorage) return normalizeNutritionRemoteConsent(null, { version })

  try {
    targetStorage.removeItem(getNutritionRemoteConsentStorageKey(userId))
  } catch {
    // Fail safe: if storage cannot be changed, the next read must not grant consent.
  }

  return normalizeNutritionRemoteConsent(null, { version })
}
