import i18n from './index.js'
import { normalizeLanguageCode } from './languages.js'

function resolveLocale(locale) {
  return normalizeLanguageCode(locale || i18n.resolvedLanguage || i18n.language)
}

export function formatNumber(value, options = {}, locale) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return ''
  return new Intl.NumberFormat(resolveLocale(locale), options).format(numericValue)
}

export function formatPercent(value, options = {}, locale) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return ''
  return new Intl.NumberFormat(resolveLocale(locale), {
    maximumFractionDigits: 0,
    style: 'percent',
    ...options,
  }).format(numericValue)
}

export function formatDate(value, options = {}, locale) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(resolveLocale(locale), options).format(date)
}

export function formatTime(value, options = {}, locale) {
  return formatDate(value, {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }, locale)
}
