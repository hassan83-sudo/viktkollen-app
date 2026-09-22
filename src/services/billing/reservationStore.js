import { randomUUID } from 'node:crypto'
import { RESERVATION_STATUS } from './catalog.js'
import { SENSITIVE_USAGE_FIELDS } from './catalog.js'

const ALLOWED_KEYS = Object.freeze([
  'actual_quantity',
  'committed_at',
  'created_at',
  'expires_at',
  'feature',
  'overage_quantity',
  'period_end',
  'period_start',
  'plan_id',
  'plan_version',
  'quantity',
  'reservation_id',
  'rolled_back_at',
  'status',
  'unit',
  'user_id',
])

function clone(row) {
  return Object.freeze({ ...row })
}

export function sanitizeReservation(row) {
  const clean = {}
  for (const key of ALLOWED_KEYS) {
    if (row[key] !== undefined) clean[key] = row[key]
  }
  const blob = JSON.stringify(clean)
  for (const field of SENSITIVE_USAGE_FIELDS) {
    if (new RegExp(`"${field}"\\s*:`, 'i').test(blob)) {
      const error = new Error('sensitive_content_blocked')
      error.code = 'sensitive_content_blocked'
      throw error
    }
  }
  return clone(clean)
}

export function createInMemoryReservationStore() {
  const byId = new Map()

  return {
    async get(reservationId) {
      return byId.get(reservationId) || null
    },
    async insert(row) {
      const stored = sanitizeReservation({
        ...row,
        reservation_id: row.reservation_id || randomUUID(),
      })
      if (byId.has(stored.reservation_id)) {
        const error = new Error('duplicate_reservation')
        error.code = 'duplicate_reservation'
        throw error
      }
      byId.set(stored.reservation_id, stored)
      return stored
    },
    async list() {
      return [...byId.values()]
    },
    async replace(row) {
      const stored = sanitizeReservation(row)
      byId.set(stored.reservation_id, stored)
      return stored
    },
    reset() {
      byId.clear()
    },
  }
}

export { RESERVATION_STATUS }
