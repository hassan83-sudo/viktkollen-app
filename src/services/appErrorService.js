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

export function normalizeAppError(error, context = {}) {
  const name = getErrorName(error)
  const rawMessage = cleanText(error?.message || error?.error || error?.reason || error)
  const lower = `${name} ${rawMessage}`.toLocaleLowerCase('sv-SE')
  const area = context.area || context.type || ''
  let type = 'unknown'
  let userMessage = 'Något gick fel. Försök igen om en stund.'

  if (lower.includes('quota') || name === 'QuotaExceededError') {
    type = 'storage_quota'
    userMessage = 'Lagringsutrymmet verkar vara fullt. Din befintliga data har inte raderats.'
  } else if (lower.includes('security') || name === 'SecurityError') {
    type = 'storage_security'
    userMessage = 'Webbläsaren blockerade lokal lagring. Kontrollera webbläsarens integritetsinställningar.'
  } else if (lower.includes('json') || lower.includes('parse') || area === 'import') {
    type = 'import'
    userMessage = 'Filen kunde inte läsas. Kontrollera att den är en giltig Viktkollen-fil.'
  } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline')) {
    type = 'network'
    userMessage = 'Nätverket verkar strula. Kontrollera anslutningen och försök igen.'
  } else if (lower.includes('supabase') || lower.includes('auth') || lower.includes('row-level') || lower.includes('jwt')) {
    type = 'supabase'
    userMessage = 'Molntjänsten svarade inte som väntat. Försök igen om en stund.'
  } else if (lower.includes('clipboard') || area === 'clipboard') {
    type = 'clipboard'
    userMessage = 'Kunde inte kopiera automatiskt. Markera texten och kopiera manuellt.'
  } else if (area === 'snapshot') {
    type = 'snapshot'
    userMessage = 'Hälsodatan kunde inte visas helt just nu. Försök igen eller ladda om appen.'
  }

  return {
    diagnosticMessage: rawMessage || name || 'Okänt fel',
    name,
    type,
    userMessage,
  }
}

export function getSafeErrorMessage(error, context = {}) {
  return normalizeAppError(error, context).userMessage
}

export function logAppError(error, context = {}) {
  if (!import.meta.env?.DEV) return

  const normalized = normalizeAppError(error, context)
  // Development-only diagnostics. The UI never receives stack traces or secrets.
  console.error('[Viktkollen]', context, normalized, error)
}
