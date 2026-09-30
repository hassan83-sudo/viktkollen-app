import { describe, expect, it } from 'vitest'
import { hashAiHelpScope } from './costGuard.js'
import { createLedgerCostStore, createSharedCostLedger } from './sharedCostLedger.js'

const firstUser = 'a'.repeat(24)
const secondUser = 'b'.repeat(24)
const start = 1_700_000_000_000

function reserveInput(overrides = {}) {
  return {
    budgetSek: 1,
    maxInputTokens: 100,
    maxOutputTokens: 400,
    periodSeconds: 3600,
    sekPerUsd: 9.93,
    userHash: firstUser,
    userLimit: 8,
    windowSeconds: 600,
    ...overrides,
  }
}

function holdFor(input = reserveInput()) {
  return Math.round(((input.maxInputTokens * 0.25 + input.maxOutputTokens * 2) / 1_000_000 * input.sekPerUsd) * 1_000_000) / 1_000_000
}

describe('shared AI Help cost ledger', () => {
  it('keeps an active reservation when the period changes and books it on the old period', async () => {
    let dbNow = start
    const ledger = createSharedCostLedger({ now: () => dbNow })
    const reserved = await ledger.reserve(reserveInput({ budgetSek: 1, claimedNow: start + 86_400_000 }))
    expect(reserved.ok).toBe(true)
    dbNow = start + 3600 * 1000
    const next = await ledger.reserve(reserveInput({
      budgetSek: 1,
      claimedNow: start,
      userHash: secondUser,
    }))
    expect(next.ok).toBe(true)
    expect(next.periodId).not.toBe(reserved.periodId)

    const beforeSettle = await ledger.snapshot()
    expect(beforeSettle.reservations.find((item) => item.id === reserved.reservationId).status).toBe('reserved')
    expect(beforeSettle.periods.find((period) => period.id === reserved.periodId).openHoldSek).toBeGreaterThan(0)

    const settled = await ledger.settle({
      claimedNow: dbNow + 999_999,
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 128,
      reservationId: reserved.reservationId,
    })
    expect(settled.ok).toBe(true)
    expect(settled.periodId).toBe(reserved.periodId)
    const after = await ledger.snapshot()
    expect(after.periods.find((period) => period.id === reserved.periodId).settledSek).toBe(settled.actualSek)
    expect(after.periods.find((period) => period.id === next.periodId).settledSek).toBe(0)
    expect(after.usage[0].reasoningTokens).toBe(128)
  })

  it('serializes two instances and ignores a higher budget from the second caller', async () => {
    let entered = 0
    let releaseGate
    const gate = new Promise((resolve) => {
      releaseGate = resolve
    })
    const ledger = createSharedCostLedger({
      enterCriticalSection: async () => {
        entered += 1
        if (entered === 1) await gate
      },
      now: () => start,
    })
    const instanceA = createLedgerCostStore(ledger)
    const instanceB = createLedgerCostStore(ledger)
    const tight = reserveInput()
    const oneHold = holdFor(tight)
    const first = instanceA.reserve({ ...tight, budgetSek: oneHold * 1.1 })
    const second = instanceB.reserve({ ...tight, budgetSek: 1000, userHash: secondUser })
    await Promise.resolve()
    expect(entered).toBe(1)
    releaseGate()
    const results = await Promise.all([first, second])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => result.reason === 'budget')).toHaveLength(1)
    expect((await ledger.snapshot()).periods[0].budgetSek).toBeCloseTo(oneHold * 1.1)
  })

  it('does not let a caller clock release a reservation while the model call can still cost money', async () => {
    let dbNow = start
    const ledger = createSharedCostLedger({ now: () => dbNow })
    const budget = holdFor()
    const reserved = await ledger.reserve(reserveInput({ budgetSek: budget, claimedNow: start + 86_400_000 }))
    expect(reserved.ok).toBe(true)
    dbNow += 600 * 1000
    const other = await ledger.reserve(reserveInput({
      budgetSek: 1000,
      claimedNow: start,
      userHash: secondUser,
    }))
    expect(other.reason).toBe('budget')
    const snapshot = await ledger.snapshot()
    expect(snapshot.reservations[0].status).toBe('reserved')
    expect(snapshot.periods[0].openHoldSek).toBeCloseTo(budget)
  })

  it('books a late response once, on the original period', async () => {
    let dbNow = start
    const ledger = createSharedCostLedger({ now: () => dbNow })
    const reserved = await ledger.reserve(reserveInput())
    dbNow += 7200 * 1000
    const usage = {
      inputTokens: 40,
      outputTokens: 10,
      reasoningTokens: 30,
      reservationId: reserved.reservationId,
    }
    const first = await ledger.settle(usage)
    const second = await ledger.settle(usage)
    expect(first.ok).toBe(true)
    expect(first.periodId).toBe(reserved.periodId)
    expect(second).toMatchObject({ duplicate: true, ok: true })
    expect((await ledger.snapshot()).usage).toHaveLength(1)
    const conflict = await ledger.settle({ ...usage, outputTokens: 11 })
    expect(conflict.reason).toBe('conflict')
    expect((await ledger.snapshot()).usage).toHaveLength(1)
  })

  it('keeps the hold after a crash or an unknown outcome until an explicit release', async () => {
    const ledger = createSharedCostLedger({ now: () => start })
    const budget = holdFor()
    const reserved = await ledger.reserve(reserveInput({ budgetSek: budget }))
    const outstanding = await ledger.listOutstanding({ olderThanSeconds: 0 })
    expect(outstanding.reservations.map((item) => item.reservationId)).toContain(reserved.reservationId)

    const blocked = await ledger.reserve(reserveInput({ userHash: secondUser }))
    expect(blocked.reason).toBe('budget')
    const uncertain = await ledger.markUncertain({ reservationId: reserved.reservationId })
    expect(uncertain.ok).toBe(true)
    expect((await ledger.markUncertain({ reservationId: reserved.reservationId })).duplicate).toBe(true)
    expect((await ledger.snapshot()).periods[0].openHoldSek).toBeCloseTo(budget)

    expect((await ledger.release({ reason: 'short', reservationId: reserved.reservationId })).reason).toBe('invalid_request')
    const released = await ledger.resolve({
      action: 'release',
      reason: 'provider confirmed no charge',
      reservationId: reserved.reservationId,
    })
    expect(released.ok).toBe(true)
    expect((await ledger.resolve({
      action: 'release',
      reason: 'provider confirmed no charge',
      reservationId: reserved.reservationId,
    })).duplicate).toBe(true)
    expect((await ledger.snapshot()).periods[0].openHoldSek).toBe(0)
    const recovered = await ledger.reserve(reserveInput({ userHash: secondUser }))
    expect(recovered.ok).toBe(true)
  })

  it('rejects a normal settlement above the reservation and keeps the hold', async () => {
    const ledger = createSharedCostLedger({ now: () => start })
    const reserved = await ledger.reserve(reserveInput({ maxInputTokens: 20, maxOutputTokens: 10 }))
    const deviation = await ledger.settle({
      actualSek: 0,
      inputTokens: 20,
      outputTokens: 10,
      reasoningTokens: 50,
      reservationId: reserved.reservationId,
    })
    expect(deviation.reason).toBe('cost_deviation')
    const snapshot = await ledger.snapshot()
    expect(snapshot.reservations[0].status).toBe('uncertain')
    expect(snapshot.periods[0].settledSek).toBe(0)
    expect(snapshot.periods[0].openHoldSek).toBeGreaterThan(0)
    expect(snapshot.deviations).toHaveLength(1)

    const within = await ledger.settle({
      inputTokens: 10,
      outputTokens: 4,
      reasoningTokens: 2,
      reservationId: reserved.reservationId,
    })
    expect(within.ok).toBe(true)
    expect(within.actualSek).toBeGreaterThan(0)
    expect((await ledger.snapshot()).periods[0].settledSek).toBe(within.actualSek)
  })

  it('books a verified late recovery on the original period', async () => {
    let dbNow = start
    const ledger = createSharedCostLedger({ now: () => dbNow })
    const reserved = await ledger.reserve(reserveInput({ budgetSek: holdFor() }))
    const released = await ledger.resolve({
      action: 'release',
      reason: 'provider status unknown',
      reservationId: reserved.reservationId,
    })
    expect(released.ok).toBe(true)
    dbNow += 3600 * 1000
    const next = await ledger.reserve(reserveInput({ budgetSek: 1, userHash: secondUser }))
    expect(next.ok).toBe(true)
    const recovered = await ledger.resolve({
      action: 'settle',
      inputTokens: 1000,
      outputTokens: 400,
      reason: 'provider invoice confirmed',
      reasoningTokens: 0,
      reservationId: reserved.reservationId,
    })
    expect(recovered.ok).toBe(true)
    expect(recovered.periodId).toBe(reserved.periodId)
    const snapshot = await ledger.snapshot()
    expect(snapshot.periods.find((period) => period.id === reserved.periodId).settledSek).toBe(recovered.actualSek)
    expect(snapshot.periods.find((period) => period.id === next.periodId).settledSek).toBe(0)
    expect(snapshot.deviations).toHaveLength(1)
    const again = await ledger.resolve({
      action: 'settle',
      inputTokens: 1000,
      outputTokens: 400,
      reason: 'provider invoice confirmed',
      reasoningTokens: 0,
      reservationId: reserved.reservationId,
    })
    expect(again.duplicate).toBe(true)
    expect((await ledger.snapshot()).usage).toHaveLength(1)
  })

  it('refuses a raw user id, a missing budget, and a separate ledger', async () => {
    const ledger = createSharedCostLedger({ now: () => start })
    expect((await ledger.reserve(reserveInput({ userHash: 'signed-in-user' }))).reason).toBe('invalid_hash')
    expect((await ledger.reserve(reserveInput({ budgetSek: 0 }))).reason).toBe('budget_not_configured')
    const hashed = await ledger.reserve(reserveInput({ userHash: hashAiHelpScope('signed-in-user') }))
    expect(hashed.ok).toBe(true)

    const otherProcess = createSharedCostLedger({ now: () => start })
    expect((await otherProcess.reserve(reserveInput())).ok).toBe(true)
    expect((await ledger.snapshot()).reservations[0].status).toBe('reserved')
    expect((await otherProcess.snapshot()).periods).toHaveLength(1)
  })
})
