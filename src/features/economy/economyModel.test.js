/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateBillStatus,
  calculateBudgetStatus,
  calculateCategoryBreakdown,
  calculateDebtSummary,
  calculateEconomyMonth,
  calculateSavingGoal,
  clearEconomyState,
  economyStorageKey,
  getEconomyAssistantCapabilities,
  getSubscriptionMonthlyMinor,
  getSubscriptionYearlyMinor,
  normalizeEconomyState,
  normalizePurchase,
  parseMoneyToMinorUnits,
  readEconomyState,
  saveEconomyState,
} from './economyModel.js'

describe('economyModel', () => {
  beforeEach(() => window.localStorage.clear())

  it('stores money as minor units and rejects invalid amounts', () => {
    expect(parseMoneyToMinorUnits('12,34')).toBe(1234)
    expect(parseMoneyToMinorUnits('12.3')).toBe(1230)
    expect(parseMoneyToMinorUnits('NaN')).toBe(null)
    expect(parseMoneyToMinorUnits('Infinity')).toBe(null)
    expect(parseMoneyToMinorUnits('')).toBe(null)
  })

  it('calculates income minus expenses without showing positive remaining when income is missing', () => {
    const state = normalizeEconomyState({
      incomes: [{ amountMinor: 200000, confirmed: true, date: '2026-08-01', id: 'salary', name: 'Lön' }, { amountMinor: 50000, confirmed: false, date: '2026-08-02', id: 'planned', name: 'Planerad' }],
      purchases: [{ amountMinor: 4550, category: 'food', date: '2026-08-04', description: 'Mat', id: 'p1' }],
      savingTransactions: [{ amountMinor: 10000, confirmed: true, date: '2026-08-05', goalId: 'g1', id: 's1', type: 'deposit' }],
    })

    const month = calculateEconomyMonth(state, '2026-08')
    expect(month.incomeTotalMinor).toBe(200000)
    expect(month.expenseTotalMinor).toBe(4550)
    expect(month.remainingMinor).toBe(195450)
    expect(month.savedTotalMinor).toBe(10000)
    expect(month.plannedIncomes).toHaveLength(1)

    expect(calculateEconomyMonth({ purchases: state.purchases }, '2026-08').remainingMinor).toBe(0)
  })

  it('calculates category shares, zero totals and refunds without division errors', () => {
    const state = normalizeEconomyState({
      purchases: [
        { amountMinor: 10000, category: 'food', date: '2026-08-01', description: 'Mat', id: 'food' },
        { amountMinor: 5000, category: 'transport', date: '2026-08-02', description: 'Buss', id: 'bus' },
        { amountMinor: 2500, category: 'food', date: '2026-08-03', description: 'Retur', id: 'refund', type: 'refund' },
      ],
    })

    const breakdown = calculateCategoryBreakdown(state, '2026-08')
    expect(breakdown.find((entry) => entry.category === 'food').percent).toBeCloseTo(66.666, 2)
    expect(calculateEconomyMonth(state, '2026-08').refunds).toHaveLength(1)
    expect(calculateCategoryBreakdown({}, '2026-08').every((entry) => entry.percent === 0)).toBe(true)
  })

  it('handles budgets, debt ordering, subscriptions, bills and saving goals', () => {
    const state = normalizeEconomyState({
      budgets: [{ amountMinor: 10000, category: 'food', id: 'b1', month: '2026-08' }, { amountMinor: 0, category: 'transport', id: 'b2', month: '2026-08' }],
      debts: [
        { id: 'small', interestRate: 0, name: 'Liten', originalAmountMinor: 10000, plannedPaymentMinor: 1000, remainingAmountMinor: 8000 },
        { id: 'rate', interestRate: 12, name: 'Ränta', originalAmountMinor: 50000, plannedPaymentMinor: 2000, remainingAmountMinor: 40000 },
      ],
      purchases: [{ amountMinor: 12000, category: 'food', date: '2026-08-04', description: 'Mat', id: 'p1' }],
    })

    const budgets = calculateBudgetStatus(state, '2026-08')
    expect(budgets[0].status).toBe('over')
    expect(budgets[1].usedPercent).toBe(0)

    const debt = calculateDebtSummary(state)
    expect(debt.snowball[0].id).toBe('small')
    expect(debt.avalanche[0].id).toBe('rate')
    expect(debt.estimatedMonths).toBe(16)

    expect(calculateBillStatus({ dueDate: '2026-08-01', paid: false }, '2026-08-10')).toBe('overdue')
    expect(calculateBillStatus({ dueDate: '2026-08-11', paid: false }, '2026-08-10')).toBe('soon')
    expect(getSubscriptionMonthlyMinor({ amountMinor: 120000, period: 'yearly' })).toBe(10000)
    expect(getSubscriptionYearlyMinor({ amountMinor: 9900, period: 'monthly' })).toBe(118800)
    expect(calculateSavingGoal({ currentAmountMinor: 120000, targetAmountMinor: 100000 }).visualPercent).toBe(100)
  })

  it('normalizes corrupt, old and duplicate storage safely without cloud helpers', () => {
    window.localStorage.setItem(economyStorageKey, '{bad')
    expect(readEconomyState().purchases).toEqual([])

    const state = normalizeEconomyState({
      schemaVersion: 0,
      settings: { activated: true, amountsHidden: true },
      purchases: [
        { amountMinor: 1, id: 'dup', date: '2026-08-01' },
        { amountMinor: 2, id: 'dup', date: '2026-08-02' },
        { amountMinor: -5, id: 'bad', date: 'bad' },
      ],
    })
    expect(state.purchases).toHaveLength(2)
    expect(state.purchases[1].amountMinor).toBe(0)
    expect(state.settings.amountsHidden).toBe(true)

    saveEconomyState(state)
    expect(window.localStorage.getItem(economyStorageKey)).toContain('schemaVersion')
    clearEconomyState()
    expect(window.localStorage.getItem(economyStorageKey)).toBe(null)
  })

  it('keeps bank details out of normalized purchases and future assistant capabilities safe', () => {
    const purchase = normalizePurchase({ amountMinor: 100, cardNumber: '4111111111111111', accountNumber: '1234', id: 'p1' })
    expect(JSON.stringify(purchase)).not.toContain('4111111111111111')
    expect(JSON.stringify(getEconomyAssistantCapabilities())).toContain('"placeholder":true')
    expect(getEconomyAssistantCapabilities().canMoveMoney).toBe(false)
  })
})
