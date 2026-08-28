export const economyStorageKey = 'viktkollen.economy.v1'
export const economySchemaVersion = 1
export const economyRetentionPolicy = 'local-until-user-deletes'

export const economyCategories = Object.freeze([
  'housing',
  'food',
  'transport',
  'shopping',
  'subscriptions',
  'health',
  'fun',
  'debt',
  'other',
])

export const paymentPeriods = Object.freeze(['monthly', 'quarterly', 'yearly'])
export const billRepeats = Object.freeze(['none', 'monthly', 'quarterly', 'yearly'])

const defaultSettings = Object.freeze({
  activated: false,
  aiAssistantEnabled: false,
  amountsHidden: false,
  appLockCapability: false,
  currency: 'SEK',
})

export const defaultEconomyState = Object.freeze({
  schemaVersion: economySchemaVersion,
  settings: defaultSettings,
  purchases: [],
  incomes: [],
  budgets: [],
  debts: [],
  debtPayments: [],
  bills: [],
  subscriptions: [],
  savingGoals: [],
  savingTransactions: [],
  updatedAt: '',
})

function cloneDefaultState() {
  return {
    ...defaultEconomyState,
    settings: { ...defaultSettings },
    purchases: [],
    incomes: [],
    budgets: [],
    debts: [],
    debtPayments: [],
    bills: [],
    subscriptions: [],
    savingGoals: [],
    savingTransactions: [],
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function safeText(value, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength)
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

function safeDate(value, fallback = new Date().toISOString().slice(0, 10)) {
  return isValidDate(value) ? value : fallback
}

function safeMonth(value, fallback = new Date().toISOString().slice(0, 7)) {
  return /^\d{4}-\d{2}$/.test(String(value || '')) ? value : fallback
}

function makeId(prefix, now = new Date().toISOString()) {
  return `${prefix}-${now}-${Math.random().toString(36).slice(2, 8)}`
}

export function parseMoneyToMinorUnits(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value * 100)
  const normalized = String(value || '').trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [whole, decimals = ''] = normalized.split('.')
  const amount = (Number.parseInt(whole, 10) * 100) + Number.parseInt(decimals.padEnd(2, '0'), 10)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

function safeMinor(value) {
  if (Number.isSafeInteger(value) && value >= 0) return value
  return parseMoneyToMinorUnits(value) ?? 0
}

function safeCategory(value) {
  return economyCategories.includes(value) ? value : 'other'
}

function dedupeById(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (!row.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

export function normalizePurchase(item = {}) {
  return {
    id: safeText(item.id) || makeId('purchase'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    category: safeCategory(item.category),
    date: safeDate(item.date),
    description: safeText(item.description || item.merchant, 120),
    note: safeText(item.note, 500),
    paymentMethod: safeText(item.paymentMethod, 80),
    type: item.type === 'refund' ? 'refund' : 'purchase',
  }
}

export function normalizeIncome(item = {}) {
  return {
    id: safeText(item.id) || makeId('income'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    confirmed: item.confirmed === true,
    date: safeDate(item.date),
    name: safeText(item.name, 120),
    note: safeText(item.note, 500),
    recurring: item.recurring === true,
  }
}

export function normalizeBudget(item = {}) {
  return {
    id: safeText(item.id) || `${safeMonth(item.month)}-${safeCategory(item.category)}`,
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    category: safeCategory(item.category),
    month: safeMonth(item.month),
  }
}

export function normalizeDebt(item = {}) {
  const originalAmountMinor = safeMinor(item.originalAmountMinor ?? item.originalAmount)
  const remainingAmountMinor = safeMinor(item.remainingAmountMinor ?? item.remainingAmount)
  const interestRate = Number(item.interestRate)
  return {
    id: safeText(item.id) || makeId('debt'),
    dueDay: Math.min(31, Math.max(1, Number.parseInt(item.dueDay, 10) || 1)),
    interestRate: Number.isFinite(interestRate) && interestRate >= 0 ? interestRate : null,
    minimumPaymentMinor: safeMinor(item.minimumPaymentMinor ?? item.minimumPayment),
    name: safeText(item.name, 120),
    note: safeText(item.note, 500),
    originalAmountMinor,
    plannedPaymentMinor: safeMinor(item.plannedPaymentMinor ?? item.plannedPayment),
    remainingAmountMinor: Math.min(remainingAmountMinor || originalAmountMinor, originalAmountMinor || remainingAmountMinor),
    startDate: safeDate(item.startDate),
  }
}

export function normalizeDebtPayment(item = {}) {
  return {
    id: safeText(item.id) || makeId('debt-payment'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    confirmed: item.confirmed === true,
    date: safeDate(item.date),
    debtId: safeText(item.debtId),
    extraAmountMinor: safeMinor(item.extraAmountMinor ?? item.extraAmount),
    note: safeText(item.note, 500),
  }
}

export function normalizeBill(item = {}) {
  return {
    id: safeText(item.id) || makeId('bill'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    category: safeCategory(item.category),
    dueDate: safeDate(item.dueDate),
    name: safeText(item.name, 120),
    note: safeText(item.note, 500),
    paid: item.paid === true,
    paidDate: item.paid === true ? safeDate(item.paidDate || item.dueDate) : '',
    repeat: billRepeats.includes(item.repeat) ? item.repeat : 'none',
  }
}

export function normalizeSubscription(item = {}) {
  return {
    id: safeText(item.id) || makeId('subscription'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    bindingUntil: isValidDate(item.bindingUntil) ? item.bindingUntil : '',
    cancellationDate: isValidDate(item.cancellationDate) ? item.cancellationDate : '',
    category: safeCategory(item.category),
    name: safeText(item.name, 120),
    nextPaymentDate: safeDate(item.nextPaymentDate),
    period: paymentPeriods.includes(item.period) ? item.period : 'monthly',
    status: ['active', 'paused', 'ended'].includes(item.status) ? item.status : 'active',
  }
}

export function normalizeSavingGoal(item = {}) {
  return {
    id: safeText(item.id) || makeId('saving-goal'),
    color: ['cyan', 'purple', 'pink', 'orange', 'green'].includes(item.color) ? item.color : 'cyan',
    currentAmountMinor: safeMinor(item.currentAmountMinor ?? item.currentAmount),
    monthlyPlanMinor: safeMinor(item.monthlyPlanMinor ?? item.monthlyPlan),
    name: safeText(item.name, 120),
    targetAmountMinor: safeMinor(item.targetAmountMinor ?? item.targetAmount),
    targetDate: isValidDate(item.targetDate) ? item.targetDate : '',
  }
}

export function normalizeSavingTransaction(item = {}) {
  return {
    id: safeText(item.id) || makeId('saving-transaction'),
    amountMinor: safeMinor(item.amountMinor ?? item.amount),
    confirmed: item.confirmed === true,
    date: safeDate(item.date),
    goalId: safeText(item.goalId),
    type: item.type === 'withdrawal' ? 'withdrawal' : 'deposit',
  }
}

export function normalizeEconomyState(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {}
  return {
    ...cloneDefaultState(),
    settings: {
      ...defaultSettings,
      activated: settings.activated === true,
      aiAssistantEnabled: false,
      amountsHidden: settings.amountsHidden === true,
      appLockCapability: false,
      currency: safeText(settings.currency, 3) || 'SEK',
    },
    purchases: dedupeById(safeArray(source.purchases).map(normalizePurchase)),
    incomes: dedupeById(safeArray(source.incomes).map(normalizeIncome)),
    budgets: dedupeById(safeArray(source.budgets).map(normalizeBudget)),
    debts: dedupeById(safeArray(source.debts).map(normalizeDebt)),
    debtPayments: dedupeById(safeArray(source.debtPayments).map(normalizeDebtPayment)),
    bills: dedupeById(safeArray(source.bills).map(normalizeBill)),
    subscriptions: dedupeById(safeArray(source.subscriptions).map(normalizeSubscription)),
    savingGoals: dedupeById(safeArray(source.savingGoals).map(normalizeSavingGoal)),
    savingTransactions: dedupeById(safeArray(source.savingTransactions).map(normalizeSavingTransaction)),
    updatedAt: safeText(source.updatedAt, 40),
  }
}

export function readEconomyState() {
  if (typeof window === 'undefined' || !window.localStorage) return cloneDefaultState()
  try {
    return normalizeEconomyState(JSON.parse(window.localStorage.getItem(economyStorageKey) || 'null'))
  } catch {
    return cloneDefaultState()
  }
}

export function saveEconomyState(state) {
  const next = normalizeEconomyState({ ...state, updatedAt: new Date().toISOString() })
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(economyStorageKey, JSON.stringify(next))
  }
  return next
}

export function clearEconomyState() {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(economyStorageKey)
  return cloneDefaultState()
}

function rowsForMonth(rows, dateKey, month) {
  return rows.filter((row) => String(row[dateKey] || '').startsWith(month))
}

export function sumMinor(rows, selector = (row) => row.amountMinor) {
  return rows.reduce((sum, row) => {
    const value = selector(row)
    return Number.isSafeInteger(value) && value > 0 ? sum + value : sum
  }, 0)
}

export function calculateEconomyMonth(state, month) {
  const normalized = normalizeEconomyState(state)
  const purchases = rowsForMonth(normalized.purchases, 'date', month)
  const expensePurchases = purchases.filter((item) => item.type === 'purchase')
  const refunds = purchases.filter((item) => item.type === 'refund')
  const confirmedIncomes = rowsForMonth(normalized.incomes, 'date', month).filter((item) => item.confirmed)
  const plannedIncomes = rowsForMonth(normalized.incomes, 'date', month).filter((item) => !item.confirmed)
  const bills = rowsForMonth(normalized.bills, 'dueDate', month)
  const savingTransactions = rowsForMonth(normalized.savingTransactions, 'date', month).filter((item) => item.confirmed)
  const expenseTotalMinor = sumMinor(expensePurchases)
  const incomeTotalMinor = sumMinor(confirmedIncomes)
  const savedTotalMinor = sumMinor(savingTransactions.filter((item) => item.type === 'deposit')) - sumMinor(savingTransactions.filter((item) => item.type === 'withdrawal'))

  return {
    bills,
    confirmedIncomes,
    dataCompleteness: incomeTotalMinor > 0 || expenseTotalMinor > 0 ? 'manual-partial' : 'empty',
    expensePurchases,
    expenseTotalMinor,
    incomeTotalMinor,
    plannedIncomes,
    refunds,
    remainingMinor: incomeTotalMinor > 0 ? incomeTotalMinor - expenseTotalMinor : 0,
    savedTotalMinor,
    upcomingBillsMinor: sumMinor(bills.filter((bill) => !bill.paid)),
  }
}

export function calculateCategoryBreakdown(state, month) {
  const monthData = calculateEconomyMonth(state, month)
  return economyCategories.map((category) => {
    const items = monthData.expensePurchases.filter((item) => item.category === category)
    const amountMinor = sumMinor(items)
    return {
      amountMinor,
      category,
      count: items.length,
      items,
      percent: monthData.expenseTotalMinor > 0 ? (amountMinor / monthData.expenseTotalMinor) * 100 : 0,
    }
  })
}

export function calculateBudgetStatus(state, month) {
  const breakdown = calculateCategoryBreakdown(state, month)
  return normalizeEconomyState(state).budgets.filter((budget) => budget.month === month).map((budget) => {
    const usedMinor = breakdown.find((entry) => entry.category === budget.category)?.amountMinor || 0
    return {
      ...budget,
      remainingMinor: budget.amountMinor - usedMinor,
      status: budget.amountMinor === 0 ? 'no-budget' : usedMinor > budget.amountMinor ? 'over' : 'inside',
      usedMinor,
      usedPercent: budget.amountMinor > 0 ? (usedMinor / budget.amountMinor) * 100 : 0,
    }
  })
}

export function calculateDebtSummary(state) {
  const debts = normalizeEconomyState(state).debts
  const totalRemainingMinor = sumMinor(debts, (debt) => debt.remainingAmountMinor)
  const monthlyPaymentMinor = sumMinor(debts, (debt) => debt.plannedPaymentMinor || debt.minimumPaymentMinor)
  return {
    avalanche: [...debts].sort((a, b) => (b.interestRate ?? -1) - (a.interestRate ?? -1)),
    estimatedInterestMinor: debts.some((debt) => debt.interestRate !== null)
      ? debts.reduce((sum, debt) => sum + Math.round(debt.remainingAmountMinor * ((debt.interestRate || 0) / 100) / 12), 0)
      : null,
    estimatedMonths: monthlyPaymentMinor > 0 ? Math.ceil(totalRemainingMinor / monthlyPaymentMinor) : null,
    monthlyPaymentMinor,
    snowball: [...debts].sort((a, b) => a.remainingAmountMinor - b.remainingAmountMinor),
    totalRemainingMinor,
  }
}

export function calculateBillStatus(bill, today = new Date().toISOString().slice(0, 10)) {
  if (bill.paid) return 'paid'
  if (bill.dueDate < today) return 'overdue'
  const diff = Math.ceil((new Date(`${bill.dueDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
  return diff <= 7 ? 'soon' : 'upcoming'
}

export function getSubscriptionMonthlyMinor(subscription) {
  const amount = safeMinor(subscription.amountMinor)
  if (subscription.period === 'yearly') return Math.round(amount / 12)
  if (subscription.period === 'quarterly') return Math.round(amount / 3)
  return amount
}

export function getSubscriptionYearlyMinor(subscription) {
  return getSubscriptionMonthlyMinor(subscription) * 12
}

export function calculateSavingGoal(goal) {
  const target = safeMinor(goal.targetAmountMinor)
  const current = safeMinor(goal.currentAmountMinor)
  const remainingMinor = Math.max(0, target - current)
  return {
    estimatedTargetDate: goal.monthlyPlanMinor > 0 && remainingMinor > 0 ? `~${Math.ceil(remainingMinor / goal.monthlyPlanMinor)} mån` : '',
    percent: target > 0 ? (current / target) * 100 : 0,
    remainingMinor,
    visualPercent: target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0,
  }
}

export function getEconomyAssistantCapabilities() {
  return {
    canAskForBankCredentials: false,
    canMoveMoney: false,
    canPayBills: false,
    canUseBackend: false,
    placeholder: true,
  }
}
