import { safeLogger, sanitizeLogValue } from './safeLogger.js'

const sensitivePattern = /(token|apikey|api[_-]?key|authorization|bearer|supabase|password|session|secret)[\s:=/"']+[^\s,;)"']+/gi
const stackPattern = /\s+at\s+[\w$.<>()]+\s+\([^)]*\)/g
const technicalValuePattern = /\b(undefined|null|nan|infinity)\b|\[object object\]/gi

function cleanText(value) {
  return String(value ?? '')
    .replace(sensitivePattern, '$1 [doltes]')
    .replace(stackPattern, '')
    .replace(technicalValuePattern, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getErrorName(error) {
  return error?.name || error?.code || ''
}

function hashText(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function normalizeAppError(error, context = {}) {
  const name = getErrorName(error)
  const rawMessage = cleanText(error?.message || error?.error || error?.reason || error)
  const lower = `${name} ${rawMessage}`.toLocaleLowerCase('sv-SE')
  const area = context.area || context.type || ''
  let safeCategory = 'unknown'
  let safeUserMessage = 'Något gick fel. Försök igen om en stund.'
  let retryable = true
  let severity = 'medium'

  if (lower.includes('quota') || name === 'QuotaExceededError') {
    safeCategory = 'storage'
    safeUserMessage = 'Lagringsutrymmet verkar vara fullt. Din befintliga data har inte raderats.'
    severity = 'high'
  } else if (lower.includes('security') || name === 'SecurityError') {
    safeCategory = 'permission'
    safeUserMessage = 'Webbläsaren blockerade åtkomst. Kontrollera webbläsarens inställningar.'
    retryable = false
  } else if (lower.includes('json') || lower.includes('parse') || area === 'import') {
    safeCategory = area === 'storage' ? 'storage' : 'import'
    safeUserMessage = area === 'storage'
      ? 'Sparad data kunde inte läsas helt just nu. Befintlig data raderas inte automatiskt.'
      : 'Filen kunde inte läsas. Kontrollera att den är en giltig Viktkollen-fil.'
    retryable = false
  } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline')) {
    safeCategory = 'network'
    safeUserMessage = 'Nätverket verkar strula. Kontrollera anslutningen och försök igen.'
  } else if (lower.includes('timeout') || lower.includes('timed out')) {
    safeCategory = 'timeout'
    safeUserMessage = 'Det tog för lång tid. Försök igen om en stund.'
  } else if (lower.includes('rate') || lower.includes('too many')) {
    safeCategory = 'rateLimit'
    safeUserMessage = 'Det blev många försök på kort tid. Vänta lite och försök igen.'
  } else if (lower.includes('conflict')) {
    safeCategory = 'conflict'
    safeUserMessage = 'Datan behöver jämföras innan den sparas över.'
    severity = 'high'
  } else if (lower.includes('supabase') || lower.includes('row-level') || lower.includes('server')) {
    safeCategory = 'server'
    safeUserMessage = 'Molntjänsten svarade inte som väntat. Försök igen om en stund.'
  } else if (lower.includes('auth') || lower.includes('jwt') || area === 'auth') {
    safeCategory = 'auth'
    safeUserMessage = 'Inloggningen kunde inte bekräftas just nu. Försök igen utan att radera lokal data.'
  } else if (lower.includes('clipboard') || area === 'clipboard') {
    safeCategory = 'permission'
    safeUserMessage = 'Kunde inte kopiera automatiskt. Markera texten och kopiera manuellt.'
    retryable = false
  } else if (area === 'snapshot') {
    safeCategory = 'validation'
    safeUserMessage = 'Hälsodatan kunde inte visas helt just nu. Försök igen eller ladda om appen.'
  } else if (area === 'render') {
    safeCategory = 'render'
    safeUserMessage = 'Den här delen kunde inte visas just nu. Försök igen eller ladda om appen.'
    severity = 'high'
  }

  const technicalCode = `${safeCategory}-${hashText(`${name}:${rawMessage}:${area}`).toString(36).slice(0, 8)}`

  return {
    diagnosticMessage: rawMessage || name || 'Okänt fel',
    name,
    retryable,
    safeCategory,
    safeUserMessage,
    severity,
    shouldLogout: false,
    shouldReport: severity === 'high',
    shouldRetry: retryable,
    technicalCode,
    type: safeCategory,
    userMessage: safeUserMessage,
  }
}

export function getSafeErrorMessage(error, context = {}) {
  return normalizeAppError(error, context).safeUserMessage
}

export function logAppError(error, context = {}) {
  const normalized = normalizeAppError(error, context)
  safeLogger.error('Appfel', {
    context: sanitizeLogValue(context),
    error: import.meta.env?.DEV ? sanitizeLogValue(error) : undefined,
    normalized,
  })
}
