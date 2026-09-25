// A11Y-8X1: validation for DateTimeDialog (a real calendar date as
// YYYY-MM-DD, and a 24 h time as HH:MM).

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidDateValue(value) {
  const match = datePattern.exec(String(value || ''))
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function isValidTimeValue(value) {
  return timePattern.test(String(value || ''))
}
