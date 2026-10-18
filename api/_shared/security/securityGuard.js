import { createHash } from 'node:crypto'

// Per-instance guards for Security Center writes. Nothing here is persisted:
// actor keys are one-way hashes held in memory only to count bursts, and the
// database never receives user ids, IP addresses or tokens.

const WRITE_COOLDOWN_MS = 10 * 1000
const MAX_KEYS = 500

const lastWrite = new Map()
const bursts = new Map()

function prune(map) {
  while (map.size > MAX_KEYS) map.delete(map.keys().next().value)
}

// At most one database write per event type and feature every 10 seconds per
// instance. The database already merges repeats within 60 seconds, so this
// only removes redundant calls during a flood.
export function shouldWriteSecurityEvent(key, now = Date.now()) {
  const previous = lastWrite.get(key)
  if (previous !== undefined && now - previous < WRITE_COOLDOWN_MS) return false
  lastWrite.delete(key)
  lastWrite.set(key, now)
  prune(lastWrite)
  return true
}

export function hashActor(value) {
  const text = String(value || '').trim()
  if (!text) return 'unknown'
  return createHash('sha256').update(`viktkollen-security:${text}`).digest('hex').slice(0, 16)
}

// True once when an actor reaches the threshold inside the window; the count
// then starts over, so a sustained flood reports again only after another
// full threshold of attempts.
export function recordBurst(name, actorKey, { threshold, windowMs }, now = Date.now()) {
  const key = `${name}:${actorKey}`
  const current = bursts.get(key)
  const fresh = !current || now - current.start > windowMs
  const next = fresh ? { count: 1, start: now } : { count: current.count + 1, start: current.start }
  bursts.delete(key)
  if (next.count >= threshold) {
    prune(bursts)
    return true
  }
  bursts.set(key, next)
  prune(bursts)
  return false
}

export function requestSourceKey(request) {
  const headers = request?.headers || {}
  const forwarded = String(headers['x-forwarded-for'] || headers['x-real-ip'] || '').split(',')[0]
  return hashActor(forwarded)
}

export function resetSecurityGuardForTests() {
  lastWrite.clear()
  bursts.clear()
}
