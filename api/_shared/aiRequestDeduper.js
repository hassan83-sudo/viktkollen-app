import { createHash } from 'node:crypto'

const DEFAULT_TTL_MS = 30 * 1000
const inFlight = new Map()

function hashValue(value = '') {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 32)
}

export function createAiRequestFingerprint(value = {}) {
  return hashValue(JSON.stringify(value))
}

export function createImageFingerprint(image = {}) {
  return hashValue([
    image.contentType || '',
    image.size || 0,
    image.data ? hashValue(image.data) : '',
  ].join(':'))
}

function makeKey({ fingerprint = '', route = 'ai', userId = '' } = {}) {
  return `${route}:${hashValue(userId)}:${fingerprint}`
}

function cleanup(now = Date.now()) {
  for (const [key, entry] of inFlight.entries()) {
    if (entry.expiresAt <= now) inFlight.delete(key)
  }
}

export function runDedupedAiRequest({ fingerprint, route, ttlMs = DEFAULT_TTL_MS, userId }, producer) {
  const now = Date.now()
  cleanup(now)
  const key = makeKey({ fingerprint, route, userId })
  const existing = inFlight.get(key)
  if (existing) return { deduped: true, promise: existing.promise }

  const promise = Promise.resolve()
    .then(producer)
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, { expiresAt: now + ttlMs, promise })
  return { deduped: false, promise }
}

export function resetAiRequestDeduperForTests() {
  inFlight.clear()
}

export const aiRequestDeduperInternals = {
  inFlight,
  makeKey,
}
