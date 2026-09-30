import { randomUUID } from 'node:crypto'
import {
  AI_HELP_INPUT_USD_PER_MILLION,
  AI_HELP_OUTPUT_USD_PER_MILLION,
  aiHelpCostSek,
  billableOutputTokens,
} from './costGuard.js'

const HASH_PATTERN = /^[0-9a-f]{24}$/
const OPEN_STATUSES = new Set(['reserved', 'uncertain'])

function money(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function openHoldSek(state, periodId) {
  let total = 0
  for (const reservation of state.reservations.values()) {
    if (reservation.periodId === periodId && OPEN_STATUSES.has(reservation.status)) {
      total += reservation.holdSek
    }
  }
  return total
}

function currentPeriod(state, dbNow) {
  return state.periods.find((period) => period.startedAt <= dbNow && dbNow < period.endsAt) || null
}

function usageMatches(reservation, usage) {
  return reservation.inputTokens === usage.inputTokens
    && reservation.outputTokens === usage.outputTokens
    && reservation.reasoningTokens === usage.reasoningTokens
}

function readUsage(input) {
  const inputTokens = integer(input?.inputTokens)
  const outputTokens = integer(input?.outputTokens)
  const reasoningTokens = integer(input?.reasoningTokens ?? 0)
  if (inputTokens === null || inputTokens < 0) return null
  if (outputTokens === null || outputTokens < 0) return null
  if (reasoningTokens === null || reasoningTokens < 0) return null
  return { inputTokens, outputTokens, reasoningTokens }
}

function pricedUsage(reservation, usage) {
  const billable = billableOutputTokens(usage.outputTokens, usage.reasoningTokens)
  const actualSek = aiHelpCostSek({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    sekPerUsd: reservation.sekPerUsd,
    inputUsdPerMillion: AI_HELP_INPUT_USD_PER_MILLION,
    outputUsdPerMillion: AI_HELP_OUTPUT_USD_PER_MILLION,
  })
  return { actualSek, billable }
}

function rememberDeviation(state, reservation, usage, actualSek, dbNow) {
  const existing = state.deviations.find((item) => (
    item.reservationId === reservation.id
    && item.inputTokens === usage.inputTokens
    && item.outputTokens === usage.outputTokens
    && item.reasoningTokens === usage.reasoningTokens
  ))
  if (existing) return
  state.deviations.push({
    actualSek,
    createdAt: dbNow,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    periodId: reservation.periodId,
    reasoningTokens: usage.reasoningTokens,
    reservationId: reservation.id,
  })
}

function reserveLocked(state, input, dbNow) {
  const userHash = String(input?.userHash || '')
  const budgetSek = money(input?.budgetSek)
  const periodSeconds = integer(input?.periodSeconds)
  const userLimit = integer(input?.userLimit)
  const windowSeconds = integer(input?.windowSeconds)
  const maxInputTokens = integer(input?.maxInputTokens)
  const maxOutputTokens = integer(input?.maxOutputTokens)
  const sekPerUsd = money(input?.sekPerUsd)

  if (!HASH_PATTERN.test(userHash)) return { ok: false, reason: 'invalid_hash' }
  if (periodSeconds === null || periodSeconds < 1) return { ok: false, reason: 'invalid_request' }
  if (userLimit === null || userLimit < 1) return { ok: false, reason: 'invalid_request' }
  if (windowSeconds === null || windowSeconds < 1) return { ok: false, reason: 'invalid_request' }
  if (maxInputTokens === null || maxInputTokens < 1) return { ok: false, reason: 'invalid_request' }
  if (maxOutputTokens === null || maxOutputTokens < 1 || maxOutputTokens > 400) {
    return { ok: false, reason: 'invalid_request' }
  }
  if (sekPerUsd === null || sekPerUsd <= 0) return { ok: false, reason: 'invalid_request' }

  const holdSek = aiHelpCostSek({
    inputTokens: maxInputTokens,
    outputTokens: maxOutputTokens,
    reasoningTokens: 0,
    sekPerUsd,
  })
  if (!(holdSek > 0)) return { ok: false, reason: 'invalid_hold' }

  let period = currentPeriod(state, dbNow)
  if (!period) {
    if (budgetSek === null || budgetSek <= 0) return { ok: false, reason: 'budget_not_configured' }
    period = {
      budgetSek,
      endsAt: dbNow + periodSeconds * 1000,
      id: randomUUID(),
      settledSek: 0,
      startedAt: dbNow,
    }
    state.periods.push(period)
  } else if (budgetSek !== null && budgetSek > 0 && budgetSek < period.budgetSek) {
    period.budgetSek = budgetSek
  }

  let window = state.windows.get(userHash)
  if (!window || window.endsAt <= dbNow) {
    window = {
      count: 0,
      endsAt: dbNow + windowSeconds * 1000,
      limit: userLimit,
      startedAt: dbNow,
    }
    state.windows.set(userHash, window)
  } else {
    window.limit = Math.min(window.limit, userLimit)
  }

  if (window.count >= window.limit) {
    return {
      ok: false,
      reason: 'user_limit',
      retryAfterSeconds: Math.max(1, Math.ceil((window.endsAt - dbNow) / 1000)),
    }
  }

  const committed = period.settledSek + openHoldSek(state, period.id)
  if (committed + holdSek > period.budgetSek + 0.0000001) {
    return {
      ok: false,
      reason: 'budget',
      retryAfterSeconds: Math.max(1, Math.ceil((period.endsAt - dbNow) / 1000)),
    }
  }

  window.count += 1
  const reservation = {
    actualSek: null,
    closedAt: null,
    createdAt: dbNow,
    holdSek,
    id: randomUUID(),
    inputTokens: null,
    maxInputTokens,
    maxOutputTokens,
    outputTokens: null,
    periodId: period.id,
    reasoningTokens: null,
    releaseReason: null,
    sekPerUsd,
    status: 'reserved',
    userHash,
  }
  state.reservations.set(reservation.id, reservation)
  return { holdSek, ok: true, periodId: period.id, reservationId: reservation.id }
}

function settleLocked(state, input, dbNow, { recovery = false } = {}) {
  const reservation = state.reservations.get(String(input?.reservationId || ''))
  if (!reservation) return { ok: false, reason: 'missing_reservation' }
  const usage = readUsage(input)
  if (!usage) return { ok: false, reason: 'invalid_usage' }
  const priced = pricedUsage(reservation, usage)

  if (reservation.status === 'settled') {
    if (usageMatches(reservation, usage)) return { actualSek: reservation.actualSek, duplicate: true, ok: true }
    return { ok: false, reason: 'conflict' }
  }

  const withinReservation = usage.inputTokens <= reservation.maxInputTokens
    && priced.billable <= reservation.maxOutputTokens
    && priced.actualSek <= reservation.holdSek + 0.0000001
  const canBook = reservation.status === 'reserved'
    || reservation.status === 'uncertain'
    || (recovery && reservation.status === 'released')
  if (!withinReservation) {
    if (recovery && canBook) {
      rememberDeviation(state, reservation, usage, priced.actualSek, dbNow)
      return bookUsage(state, reservation, usage, priced.actualSek, dbNow)
    }
    if (reservation.status === 'reserved') reservation.status = 'uncertain'
    rememberDeviation(state, reservation, usage, priced.actualSek, dbNow)
    return { ok: false, reason: 'cost_deviation', reservationId: reservation.id }
  }

  if (!canBook) return { ok: false, reason: 'not_open' }
  return bookUsage(state, reservation, usage, priced.actualSek, dbNow)
}

function bookUsage(state, reservation, usage, actualSek, dbNow) {
  const period = state.periods.find((item) => item.id === reservation.periodId)
  if (!period) return { ok: false, reason: 'missing_reservation' }
  reservation.status = 'settled'
  reservation.actualSek = actualSek
  reservation.inputTokens = usage.inputTokens
  reservation.outputTokens = usage.outputTokens
  reservation.reasoningTokens = usage.reasoningTokens
  reservation.closedAt = dbNow
  period.settledSek = Math.round((period.settledSek + actualSek) * 1_000_000) / 1_000_000
  state.usage.push({
    actualSek,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    periodId: period.id,
    reasoningTokens: usage.reasoningTokens,
    reservationId: reservation.id,
    userHash: reservation.userHash,
  })
  return { actualSek, ok: true, periodId: period.id }
}

function releaseLocked(state, input, dbNow) {
  const reservation = state.reservations.get(String(input?.reservationId || ''))
  if (!reservation) return { ok: false, reason: 'missing_reservation' }
  const reason = String(input?.reason || '').trim()
  if (reason.length < 12) return { ok: false, reason: 'invalid_request' }
  if (reservation.status === 'released') return { duplicate: true, ok: true }
  if (!OPEN_STATUSES.has(reservation.status)) return { ok: false, reason: 'not_open' }
  reservation.status = 'released'
  reservation.releaseReason = reason
  reservation.closedAt = dbNow
  return { ok: true }
}

function markUncertainLocked(state, input) {
  const reservation = state.reservations.get(String(input?.reservationId || ''))
  if (!reservation) return { ok: false, reason: 'missing_reservation' }
  if (reservation.status === 'uncertain') return { duplicate: true, ok: true }
  if (reservation.status !== 'reserved') return { ok: false, reason: 'not_open' }
  reservation.status = 'uncertain'
  return { ok: true, reservationId: reservation.id }
}

function listOutstandingLocked(state, input, dbNow) {
  const olderThanSeconds = integer(input?.olderThanSeconds ?? 120)
  if (olderThanSeconds === null || olderThanSeconds < 0) return { ok: false, reason: 'invalid_request' }
  const cutoff = dbNow - olderThanSeconds * 1000
  const reservations = [...state.reservations.values()]
    .filter((reservation) => OPEN_STATUSES.has(reservation.status) && reservation.createdAt <= cutoff)
    .map((reservation) => ({
      createdAt: reservation.createdAt,
      holdSek: reservation.holdSek,
      periodId: reservation.periodId,
      reservationId: reservation.id,
      status: reservation.status,
      userHash: reservation.userHash,
    }))
  return { ok: true, reservations }
}

export function createSharedCostLedger({
  enterCriticalSection = async () => {},
  now = () => Date.now(),
} = {}) {
  let tail = Promise.resolve()
  const state = {
    deviations: [],
    periods: [],
    reservations: new Map(),
    usage: [],
    windows: new Map(),
  }

  function exclusive(work) {
    const result = tail.then(async () => {
      await enterCriticalSection()
      return work(now())
    })
    tail = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    listOutstanding: (input) => exclusive((dbNow) => listOutstandingLocked(state, input, dbNow)),
    markUncertain: (input) => exclusive(() => markUncertainLocked(state, input)),
    release: (input) => exclusive((dbNow) => releaseLocked(state, input, dbNow)),
    reserve: (input) => exclusive((dbNow) => reserveLocked(state, input, dbNow)),
    resolve: (input) => exclusive((dbNow) => {
      if (input?.action === 'release') return releaseLocked(state, input, dbNow)
      if (input?.action === 'settle') return settleLocked(state, input, dbNow, { recovery: true })
      return { ok: false, reason: 'invalid_request' }
    }),
    settle: (input) => exclusive((dbNow) => settleLocked(state, input, dbNow)),
    snapshot: () => exclusive(() => ({
      deviations: state.deviations.map((item) => ({ ...item })),
      periods: state.periods.map((period) => ({
        ...period,
        openHoldSek: openHoldSek(state, period.id),
      })),
      reservations: [...state.reservations.values()].map((reservation) => ({
        actualSek: reservation.actualSek,
        createdAt: reservation.createdAt,
        holdSek: reservation.holdSek,
        id: reservation.id,
        periodId: reservation.periodId,
        status: reservation.status,
      })),
      usage: state.usage.map((item) => ({ ...item })),
    })),
  }
}

export function createLedgerCostStore(ledger = createSharedCostLedger()) {
  return {
    ledger,
    listOutstanding: (input) => ledger.listOutstanding(input),
    markUncertain: (input) => ledger.markUncertain(input),
    release: (input) => ledger.release(input),
    reserve: (input) => ledger.reserve(input),
    resolve: (input) => ledger.resolve(input),
    settle: (input) => ledger.settle(input),
  }
}

export function createTestCostStore(options) {
  return createLedgerCostStore(createSharedCostLedger(options))
}
