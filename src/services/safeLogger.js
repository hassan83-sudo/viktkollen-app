const forbiddenKeyPattern = /(token|session|password|secret|authorization|apikey|api[_-]?key|supabase|email|image|base64|payload|localstorage)/i
const sensitiveTextPattern = /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b|(?:bearer|token|password|secret|apikey|api[_-]?key|authorization)[\s:=/"']+[^\s,;)"']+/gi
const base64LikePattern = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi
const devBufferLimit = 80
const devLogBuffer = []

function canUseDevLogs() {
  return Boolean(import.meta.env?.DEV)
}

function maskText(value) {
  return String(value ?? '')
    .replace(base64LikePattern, '[bild doldes]')
    .replace(sensitiveTextPattern, '[känsligt värde doldes]')
    .slice(0, 600)
}

function maskPrimitive(value) {
  if (typeof value === 'string') return maskText(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : '[ogiltigt tal]'
  if (typeof value === 'boolean' || value === null || value === undefined) return value
  return value
}

export function sanitizeLogValue(value, depth = 0) {
  if (depth > 3) return '[förkortat]'
  if (value instanceof Error) {
    return {
      message: maskText(value.message),
      name: maskText(value.name),
    }
  }
  if (!value || typeof value !== 'object') return maskPrimitive(value)
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeLogValue(item, depth + 1))

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
      .slice(0, 30)
      .map(([key, entryValue]) => [
        key,
        forbiddenKeyPattern.test(key) ? '[doldes]' : sanitizeLogValue(entryValue, depth + 1),
      ]),
  )
}

function write(level, message, details) {
  const entry = {
    at: new Date().toISOString(),
    details: sanitizeLogValue(details),
    level,
    message: maskText(message),
  }

  if (canUseDevLogs()) {
    devLogBuffer.push(entry)
    devLogBuffer.splice(0, Math.max(0, devLogBuffer.length - devBufferLimit))
  }

  if (level === 'debug' && !canUseDevLogs()) return entry
  if (typeof console === 'undefined') return entry
  if (level === 'error') console.error('[Viktkollen]', entry.message, entry.details)
  else if (level === 'warn') console.warn('[Viktkollen]', entry.message, entry.details)
  else if (level === 'info' && canUseDevLogs()) console.info('[Viktkollen]', entry.message, entry.details)
  else if (level === 'debug' && canUseDevLogs()) console.debug('[Viktkollen]', entry.message, entry.details)

  return entry
}

export const safeLogger = {
  debug: (message, details) => write('debug', message, details),
  error: (message, details) => write('error', message, details),
  info: (message, details) => write('info', message, details),
  warn: (message, details) => write('warn', message, details),
}

export function getDevLogBuffer() {
  return [...devLogBuffer]
}
