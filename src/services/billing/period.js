import { BILLING_INTERVALS } from './catalog.js'

function utcDate(date) {
  const at = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(at.getTime())) {
    const error = new Error('invalid_timestamp')
    error.code = 'invalid_timestamp'
    throw error
  }
  return at
}

/** Exclusive-end UTC period. Not a hardcoded 30-day window. */
export function periodBounds(interval, at = new Date()) {
  const kind = String(interval || 'month')
  if (!BILLING_INTERVALS.includes(kind)) {
    const error = new Error('invalid_billing_interval')
    error.code = 'invalid_billing_interval'
    throw error
  }
  const when = utcDate(at)
  const year = when.getUTCFullYear()
  const month = when.getUTCMonth()
  const day = when.getUTCDate()

  if (kind === 'day') {
    const start = new Date(Date.UTC(year, month, day))
    const end = new Date(Date.UTC(year, month, day + 1))
    return { interval: kind, period_end: end.toISOString(), period_start: start.toISOString() }
  }

  if (kind === 'week') {
    const weekday = when.getUTCDay()
    const daysFromMonday = (weekday + 6) % 7
    const start = new Date(Date.UTC(year, month, day - daysFromMonday))
    const end = new Date(Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + 7,
    ))
    return { interval: kind, period_end: end.toISOString(), period_start: start.toISOString() }
  }

  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 1))
  return { interval: kind, period_end: end.toISOString(), period_start: start.toISOString() }
}

export function inPeriod(iso, period) {
  const t = new Date(iso).getTime()
  const start = new Date(period.period_start).getTime()
  const end = new Date(period.period_end).getTime()
  return t >= start && t < end
}
