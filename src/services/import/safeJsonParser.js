export const jsonImportLimits = Object.freeze({
  maxArrayItems: 5000,
  maxDepth: 14,
  maxTextLength: 20000,
  maxTextSizeBytes: 5 * 1024 * 1024,
})

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype'])
const deniedKeyPatterns = [/auth/i, /session/i, /supabase/i, /token/i, /secret/i, /api[_-]?key/i, /apikey/i]

function getTextSizeBytes(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length
  }

  return String(text || '').length
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeValue(value, path = [], depth = 0, limits = jsonImportLimits) {
  if (depth > limits.maxDepth) {
    return { ok: false, reason: 'JSON-filen har för djupt nästlade data.' }
  }

  if (typeof value === 'string') {
    return { ok: true, value: value.slice(0, limits.maxTextLength) }
  }

  if (value === null || typeof value !== 'object') {
    return { ok: true, value }
  }

  if (Array.isArray(value)) {
    if (value.length > limits.maxArrayItems) {
      return { ok: false, reason: 'JSON-filen innehåller för många rader i en lista.' }
    }

    const items = []
    for (const item of value) {
      const sanitized = sanitizeValue(item, path, depth + 1, limits)
      if (!sanitized.ok) return sanitized
      items.push(sanitized.value)
    }

    return { ok: true, value: items }
  }

  if (!isObject(value)) {
    return { ok: false, reason: 'JSON-filen innehåller ett värde som inte kan importeras säkert.' }
  }

  const target = {}
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeKeys.has(key)) {
      return { ok: false, reason: 'JSON-filen innehåller osäkra objektfält.' }
    }

    if (deniedKeyPatterns.some((pattern) => pattern.test(key))) {
      continue
    }

    const sanitized = sanitizeValue(entry, [...path, key], depth + 1, limits)
    if (!sanitized.ok) return sanitized
    target[key] = sanitized.value
  }

  return { ok: true, value: target }
}

export function safeParseJson(text, options = {}) {
  const source = String(text || '').replace(/^\uFEFF/, '')
  const limits = { ...jsonImportLimits, ...(options.limits || {}) }

  if (!source.trim()) {
    return { ok: false, reason: 'Filen är tom.', value: null }
  }

  if (getTextSizeBytes(source) > limits.maxTextSizeBytes) {
    return { ok: false, reason: 'JSON-filen är för stor för säker import.', value: null }
  }

  let parsed
  try {
    parsed = JSON.parse(source)
  } catch {
    return { ok: false, reason: 'JSON-filen kunde inte tolkas.', value: null }
  }

  const sanitized = sanitizeValue(parsed, [], 0, limits)
  if (!sanitized.ok) {
    return { ...sanitized, value: null }
  }

  return { ok: true, reason: '', value: sanitized.value }
}

export const safeJsonParserInternals = {
  deniedKeyPatterns,
  getTextSizeBytes,
  sanitizeValue,
  unsafeKeys,
}
