export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseDisplayNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (isFiniteNumber(value)) return value

  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  if (!/\d/.test(normalized)) return fallback
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeLocalizedNumber(text) {
  return String(text).replace(/[\u00a0\u202f]/g, ' ')
}

export function normalizeNegativeZero(value, decimals = 1) {
  const number = parseDisplayNumber(value)
  if (number === null) return null

  const factor = 10 ** decimals
  const rounded = Math.round((number + Number.EPSILON) * factor) / factor

  return Object.is(rounded, -0) || Math.abs(rounded) < 1 / factor / 2 ? 0 : rounded
}

export function clampVisualPercent(value, { max = 100, min = 0 } = {}) {
  const number = parseDisplayNumber(value)
  if (number === null) return null

  return Math.max(min, Math.min(max, number))
}

function getFractionDigits(number, options = {}) {
  if (Number.isInteger(number) && options.minimumFractionDigits === undefined) {
    return {
      maximumFractionDigits: options.maximumFractionDigits ?? 0,
      minimumFractionDigits: 0,
    }
  }

  return {
    maximumFractionDigits: options.maximumFractionDigits ?? options.decimals ?? 1,
    minimumFractionDigits: options.minimumFractionDigits ?? options.decimals ?? 1,
  }
}

export function formatDecimal(value, options = {}) {
  const fallback = options.fallback ?? 'Saknas'
  const decimals = options.decimals ?? options.maximumFractionDigits ?? 1
  const number = normalizeNegativeZero(value, decimals)

  if (number === null) return fallback

  return normalizeLocalizedNumber(number.toLocaleString('sv-SE', getFractionDigits(number, options))).replace('−', '-')
}

export function formatSignedValue(value, options = {}) {
  const number = normalizeNegativeZero(value, options.decimals ?? 1)
  if (number === null) return options.fallback ?? 'Saknas'

  const sign = options.showPlus && number > 0 ? '+' : ''

  return `${sign}${formatDecimal(number, options)}${options.unit ? ` ${options.unit}` : ''}`
}

export function formatWeight(value, options = {}) {
  return formatSignedValue(value, {
    fallback: options.fallback ?? 'saknas',
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits: options.minimumFractionDigits,
    showPlus: options.showPlus,
    unit: 'kg',
  })
}

export function formatWeightChange(value, options = {}) {
  return formatSignedValue(value, {
    decimals: options.decimals ?? 1,
    fallback: options.fallback ?? 'Saknas',
    showPlus: options.showPlus,
    unit: 'kg',
  })
}

export function formatPercentage(value, options = {}) {
  const number = normalizeNegativeZero(value, options.decimals ?? options.maximumFractionDigits ?? 0)
  if (number === null) return options.fallback ?? 'Saknas'

  const sign = options.showPlus && number > 0 ? '+' : ''
  return `${sign}${formatDecimal(number, {
    maximumFractionDigits: options.maximumFractionDigits ?? options.decimals ?? 0,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  })} %`
}

export function formatSteps(value, fallback = 'Saknas') {
  const number = parseDisplayNumber(value)
  if (number === null || number < 0) return fallback

  return `${normalizeLocalizedNumber(Math.round(number).toLocaleString('sv-SE', { maximumFractionDigits: 0 }))} steg`
}

export function formatCalories(value, options = {}) {
  const number = normalizeNegativeZero(value, 0)
  if (number === null || number < 0) return options.fallback ?? 'Saknas'

  const rounded = options.approx && number >= 100
    ? Math.round(number / 5) * 5
    : Math.round(number)

  return `${options.approx ? 'cirka ' : ''}${normalizeLocalizedNumber(rounded.toLocaleString('sv-SE'))} kcal`
}

export function formatGrams(value, options = {}) {
  const number = normalizeNegativeZero(value, options.decimals ?? 1)
  if (number === null || number < 0) return options.fallback ?? 'Saknas'

  const rounded = number < 10 && !Number.isInteger(number)
    ? number
    : normalizeNegativeZero(number, 0)
  const text = formatDecimal(rounded, {
    maximumFractionDigits: rounded < 10 && !Number.isInteger(rounded) ? 1 : 0,
    minimumFractionDigits: 0,
  })

  return `${text} ${options.unit ?? 'g'}`
}

export function formatSleepDuration(hoursOrMinutes, options = {}) {
  const fallback = options.fallback ?? 'Saknas'
  const number = parseDisplayNumber(hoursOrMinutes)

  if (number === null || number < 0) return fallback

  const totalMinutes = options.unit === 'minutes'
    ? Math.round(number)
    : Math.round(number * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0 && minutes <= 0) return '0 min'
  if (hours <= 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`

  return `${hours} h ${minutes} min`
}
