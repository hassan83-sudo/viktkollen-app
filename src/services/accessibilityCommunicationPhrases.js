// A11Y-7E: dedicated local storage for user-created AAC communication
// phrases. Deliberately separate from accessibilityPreferences.js's storage
// key - saved phrase text is user content, not a UI preference, and must
// never be mixed into (or wiped by resetting) the preferences object.
export const communicationPhrasesKey = 'viktkollen.accessibility.communicationPhrases.v1'

// Conservative, documented limits to prevent unbounded local storage growth.
export const maxCommunicationPhrases = 20
export const maxCommunicationPhraseLength = 120

function getStorage(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  return storage && typeof storage.getItem === 'function' ? storage : null
}

function isValidPhrase(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.id === 'string' && value.id
    && typeof value.text === 'string' && value.text.trim()
    && value.text.length <= maxCommunicationPhraseLength,
  )
}

function writeCommunicationPhrases(phrases, storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return false

  try {
    localStorage.setItem(communicationPhrasesKey, JSON.stringify(phrases))
    return true
  } catch {
    return false
  }
}

// Malformed storage (invalid JSON, wrong type, invalid item shape, entries
// beyond the limit) is normalized away rather than allowed to break the
// communication surface: never throws, always returns a safe, valid array.
export function readCommunicationPhrases(storage) {
  const localStorage = getStorage(storage)
  if (!localStorage) return []

  try {
    const raw = localStorage.getItem(communicationPhrasesKey)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isValidPhrase).slice(0, maxCommunicationPhrases)
  } catch {
    return []
  }
}

export function addCommunicationPhrase(text, storage) {
  const trimmed = String(text || '').trim()
  const current = readCommunicationPhrases(storage)

  if (!trimmed) return { error: 'empty', phrases: current }
  if (trimmed.length > maxCommunicationPhraseLength) return { error: 'tooLong', phrases: current }
  if (current.some((phrase) => phrase.text.toLowerCase() === trimmed.toLowerCase())) {
    return { error: 'duplicate', phrases: current }
  }
  if (current.length >= maxCommunicationPhrases) return { error: 'limitReached', phrases: current }

  const phrase = {
    createdAt: new Date().toISOString(),
    id: `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: trimmed,
  }
  const next = [...current, phrase]
  writeCommunicationPhrases(next, storage)
  return { error: null, phrase, phrases: next }
}

export function removeCommunicationPhrase(id, storage) {
  const next = readCommunicationPhrases(storage).filter((phrase) => phrase.id !== id)
  writeCommunicationPhrases(next, storage)
  return next
}

// Used only for the brief local Undo after a deletion: re-inserts the exact
// removed phrase (same id/createdAt) rather than creating a new one, without
// re-running duplicate detection (it was already a valid saved phrase).
export function restoreCommunicationPhrase(phrase, storage) {
  const current = readCommunicationPhrases(storage)
  if (!isValidPhrase(phrase)) return current
  if (current.some((item) => item.id === phrase.id)) return current
  if (current.length >= maxCommunicationPhrases) return current

  const next = [...current, phrase]
  writeCommunicationPhrases(next, storage)
  return next
}
