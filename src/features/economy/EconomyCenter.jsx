import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  billRepeats,
  calculateBillStatus,
  calculateBudgetStatus,
  calculateCategoryBreakdown,
  calculateDebtSummary,
  calculateEconomyMonth,
  calculateSavingGoal,
  clearEconomyState,
  economyCategories,
  economyRetentionPolicy,
  economySchemaVersion,
  economyStorageKey,
  getEconomyAssistantCapabilities,
  getSubscriptionMonthlyMinor,
  getSubscriptionYearlyMinor,
  normalizeBill,
  normalizeBudget,
  normalizeDebt,
  normalizeDebtPayment,
  normalizeIncome,
  normalizePurchase,
  normalizeSavingGoal,
  normalizeSavingTransaction,
  normalizeSubscription,
  parseMoneyToMinorUnits,
  paymentPeriods,
  readEconomyState,
  saveEconomyState,
} from './economyModel.js'

const tabs = ['overview', 'purchases', 'budget', 'debts', 'bills', 'saving']
const colors = ['#42e8f4', '#9b7cff', '#ff61c7', '#ffad4d', '#5df2a0', '#52a8ff', '#ff7f8a', '#c59cff', '#b7c4d6']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function monthNow() {
  return new Date().toISOString().slice(0, 7)
}

function money(value, hidden, language = 'sv-SE', currency = 'SEK') {
  if (hidden) return '••••'
  return new Intl.NumberFormat(language || 'sv-SE', {
    currency,
    maximumFractionDigits: 0,
    style: 'currency',
  }).format((Number(value) || 0) / 100)
}

function percent(value) {
  if (!Number.isFinite(value)) return '0 %'
  return `${Math.round(value)} %`
}

function upsert(rows, row) {
  return rows.some((item) => item.id === row.id)
    ? rows.map((item) => (item.id === row.id ? row : item))
    : [row, ...rows]
}

function EconomyCenter({ onCreateReminderDraft }) {
  const { t, i18n } = useTranslation('economy')
  const [state, setState] = useState(readEconomyState)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedMonth, setSelectedMonth] = useState(monthNow())
  const [selectedCategory, setSelectedCategory] = useState('food')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [status, setStatus] = useState('')
  const [forms, setForms] = useState({
    purchase: { amount: '', category: 'food', date: today(), description: '', note: '', paymentMethod: '', type: 'purchase' },
    income: { amount: '', confirmed: false, date: today(), name: '', note: '', recurring: false },
    budget: { amount: '', category: 'food', month: monthNow() },
    debt: { dueDay: '25', interestRate: '', minimumPayment: '', name: '', originalAmount: '', plannedPayment: '', remainingAmount: '', startDate: today() },
    debtPayment: { amount: '', debtId: '', extraAmount: '', date: today() },
    bill: { amount: '', category: 'housing', dueDate: today(), name: '', repeat: 'none' },
    subscription: { amount: '', category: 'subscriptions', name: '', nextPaymentDate: today(), period: 'monthly', status: 'active' },
    saving: { color: 'cyan', currentAmount: '', monthlyPlan: '', name: '', targetAmount: '', targetDate: '' },
    savingTransaction: { amount: '', goalId: '', type: 'deposit', date: today() },
  })

  const hidden = state.settings.amountsHidden
  const hiddenAmountLabel = t('fields.amountHidden')
  const currency = state.settings.currency || 'SEK'
  const month = useMemo(() => calculateEconomyMonth(state, selectedMonth), [selectedMonth, state])
  const breakdown = useMemo(() => calculateCategoryBreakdown(state, selectedMonth), [selectedMonth, state])
  const budgets = useMemo(() => calculateBudgetStatus(state, selectedMonth), [selectedMonth, state])
  const debtSummary = useMemo(() => calculateDebtSummary(state), [state])
  const selectedBreakdown = breakdown.find((entry) => entry.category === selectedCategory) || breakdown[0]
  const capabilities = getEconomyAssistantCapabilities()

  function persist(next, message) {
    setState(saveEconomyState(next))
    setStatus(message || '')
    setDeleteTarget(null)
  }

  function patchForm(name, field, value) {
    setForms((current) => ({ ...current, [name]: { ...current[name], [field]: value } }))
  }

  function addRow(collection, row, message) {
    persist({ ...state, [collection]: upsert(state[collection], row) }, message)
  }

  function requireAmount(value) {
    const amountMinor = parseMoneyToMinorUnits(value)
    if (amountMinor === null || amountMinor <= 0) {
      setStatus(t('status.invalidAmount'))
      return null
    }
    return amountMinor
  }

  function removeRow(collection, id) {
    persist({ ...state, [collection]: state[collection].filter((item) => item.id !== id) }, t('status.deleted'))
  }

  function activate() {
    persist({ ...state, settings: { ...state.settings, activated: true } }, t('status.activated'))
  }

  function toggleHidden() {
    persist({ ...state, settings: { ...state.settings, amountsHidden: !hidden } }, !hidden ? t('status.hidden') : t('status.visible'))
  }

  function submitPurchase(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.purchase.amount)
    if (!amountMinor || !forms.purchase.description.trim()) return
    addRow('purchases', normalizePurchase({ ...forms.purchase, amountMinor }), t('status.saved'))
  }

  function submitIncome(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.income.amount)
    if (!amountMinor || !forms.income.name.trim()) return
    addRow('incomes', normalizeIncome({ ...forms.income, amountMinor }), t('status.saved'))
  }

  function submitBudget(event) {
    event.preventDefault()
    const amountMinor = parseMoneyToMinorUnits(forms.budget.amount)
    if (amountMinor === null) return setStatus(t('status.invalidAmount'))
    addRow('budgets', normalizeBudget({ ...forms.budget, amountMinor }), t('status.saved'))
  }

  function submitDebt(event) {
    event.preventDefault()
    const originalAmountMinor = requireAmount(forms.debt.originalAmount)
    const remainingAmountMinor = parseMoneyToMinorUnits(forms.debt.remainingAmount || forms.debt.originalAmount)
    if (!originalAmountMinor || remainingAmountMinor === null || !forms.debt.name.trim()) return
    addRow('debts', normalizeDebt({ ...forms.debt, originalAmountMinor, remainingAmountMinor }), t('status.saved'))
  }

  function submitDebtPayment(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.debtPayment.amount)
    if (!amountMinor || !forms.debtPayment.debtId) return
    addRow('debtPayments', normalizeDebtPayment({ ...forms.debtPayment, amountMinor, confirmed: true }), t('status.paymentConfirmed'))
  }

  function submitBill(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.bill.amount)
    if (!amountMinor || !forms.bill.name.trim()) return
    addRow('bills', normalizeBill({ ...forms.bill, amountMinor }), t('status.saved'))
  }

  function submitSubscription(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.subscription.amount)
    if (!amountMinor || !forms.subscription.name.trim()) return
    addRow('subscriptions', normalizeSubscription({ ...forms.subscription, amountMinor }), t('status.saved'))
  }

  function submitSaving(event) {
    event.preventDefault()
    const targetAmountMinor = requireAmount(forms.saving.targetAmount)
    if (!targetAmountMinor || !forms.saving.name.trim()) return
    addRow('savingGoals', normalizeSavingGoal({ ...forms.saving, targetAmountMinor }), t('status.saved'))
  }

  function submitSavingTransaction(event) {
    event.preventDefault()
    const amountMinor = requireAmount(forms.savingTransaction.amount)
    if (!amountMinor || !forms.savingTransaction.goalId) return
    addRow('savingTransactions', normalizeSavingTransaction({ ...forms.savingTransaction, amountMinor, confirmed: true }), t('status.paymentConfirmed'))
  }

  function clearAll() {
    setState(clearEconomyState())
    setClearConfirm(false)
    setStatus(t('status.cleared'))
  }

  if (!state.settings.activated) {
    return (
      <div className="economy-center" id="economy-center">
        <section className="economy-activation" aria-labelledby="economy-activation-title">
          <p className="eyebrow">{t('privacy.eyebrow')}</p>
          <h1 id="economy-activation-title">{t('title')}</h1>
          <p>{t('privacy.intro')}</p>
          <ul>
            <li>{t('privacy.local')}</li>
            <li>{t('privacy.noBank')}</li>
            <li>{t('privacy.noSecrets')}</li>
            <li>{t('privacy.delete')}</li>
          </ul>
          <button className="primary-button" type="button" onClick={activate}>{t('privacy.activate')}</button>
        </section>
      </div>
    )
  }

  return (
    <div className="economy-center" id="economy-center">
      <header className="economy-hero">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <button className="secondary-button economy-hide-button" type="button" onClick={toggleHidden} aria-pressed={hidden}>
          <span aria-hidden="true">{hidden ? '◉' : '◎'}</span>
          {hidden ? t('actions.showAmounts') : t('actions.hideAmounts')}
        </button>
      </header>

      {status && <p className="form-success" role="status">{status}</p>}

      <div className="economy-tabs" role="tablist" aria-label={t('tabs.aria')}>
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'is-active' : ''}
            key={tab}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <section className="economy-grid" aria-labelledby="economy-overview-title">
          <div className="economy-panel economy-overview-panel">
            <label>{t('overview.month')}<input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></label>
            <h2 id="economy-overview-title">{t('tabs.overview')}</h2>
            <div className="economy-metrics">
              <Metric label={t('overview.income')} value={money(month.incomeTotalMinor, hidden, i18n.language, currency)} hidden={hidden} hiddenLabel={hiddenAmountLabel} />
              <Metric label={t('overview.expenses')} value={money(month.expenseTotalMinor, hidden, i18n.language, currency)} hidden={hidden} hiddenLabel={hiddenAmountLabel} />
              <Metric label={t('overview.remaining')} value={money(month.remainingMinor, hidden, i18n.language, currency)} hidden={hidden} hiddenLabel={hiddenAmountLabel} />
              <Metric label={t('overview.saved')} value={money(month.savedTotalMinor, hidden, i18n.language, currency)} hidden={hidden} hiddenLabel={hiddenAmountLabel} />
              <Metric label={t('overview.upcomingBills')} value={money(month.upcomingBillsMinor, hidden, i18n.language, currency)} hidden={hidden} hiddenLabel={hiddenAmountLabel} />
            </div>
            <p className="economy-data-note">{month.dataCompleteness === 'empty' ? t('overview.emptyBasis') : t('overview.manualPartial')}</p>
            <form className="economy-subform" onSubmit={submitIncome}>
              <h3>{t('overview.incomeForm')}</h3>
              <label>{t('fields.name')}<input value={forms.income.name} onChange={(event) => patchForm('income', 'name', event.target.value)} /></label>
              <AmountInput value={forms.income.amount} onChange={(value) => patchForm('income', 'amount', value)} t={t} />
              <label>{t('fields.date')}<input type="date" value={forms.income.date} onChange={(event) => patchForm('income', 'date', event.target.value)} /></label>
              <label className="economy-check-row"><input type="checkbox" checked={forms.income.confirmed} onChange={(event) => patchForm('income', 'confirmed', event.target.checked)} />{t('fields.confirmed')}</label>
              <button className="secondary-button" type="submit">{t('actions.saveIncome')}</button>
            </form>
            <Rows rows={state.incomes.map((income) => ({ ...income, amountMinor: income.amountMinor, description: income.name }))} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} onDelete={(id) => setDeleteTarget(['incomes', id])} t={t} />
          </div>

          <ExpenseWheel
            breakdown={breakdown}
            currency={currency}
            hidden={hidden}
            hiddenLabel={hiddenAmountLabel}
            language={i18n.language}
            month={selectedMonth}
            onSelect={setSelectedCategory}
            selectedCategory={selectedCategory}
            t={t}
          />

          <article className="economy-panel" aria-labelledby="economy-category-detail">
            <h2 id="economy-category-detail">{t(`categories.${selectedBreakdown.category}`)}</h2>
            <p>{t('overview.categoryDetail', {
              amount: money(selectedBreakdown.amountMinor, hidden, i18n.language, currency),
              count: selectedBreakdown.count,
              percent: percent(selectedBreakdown.percent),
            })}</p>
            {selectedBreakdown.items.length === 0 ? <p>{t('empty.noPurchases')}</p> : (
              <ul className="economy-list">
                {selectedBreakdown.items.map((item) => <li key={item.id}>{item.date} · {item.description} · <SafeAmount hidden={hidden} hiddenLabel={hiddenAmountLabel}>{money(item.amountMinor, hidden, i18n.language, currency)}</SafeAmount></li>)}
              </ul>
            )}
          </article>
        </section>
      )}

      {activeTab === 'purchases' && (
        <CrudPanel title={t('tabs.purchases')} onSubmit={submitPurchase}>
          <MoneyFormFields form={forms.purchase} name="purchase" patchForm={patchForm} t={t} />
          <label>{t('fields.type')}<select value={forms.purchase.type} onChange={(event) => patchForm('purchase', 'type', event.target.value)}><option value="purchase">{t('types.purchase')}</option><option value="refund">{t('types.refund')}</option></select></label>
          <button className="primary-button" type="submit">{t('actions.savePurchase')}</button>
          <Rows rows={state.purchases} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} onDelete={(id) => setDeleteTarget(['purchases', id])} t={t} />
        </CrudPanel>
      )}

      {activeTab === 'budget' && (
        <CrudPanel title={t('tabs.budget')} onSubmit={submitBudget}>
          <label>{t('overview.month')}<input type="month" value={forms.budget.month} onChange={(event) => patchForm('budget', 'month', event.target.value)} /></label>
          <CategorySelect value={forms.budget.category} onChange={(value) => patchForm('budget', 'category', value)} t={t} />
          <AmountInput value={forms.budget.amount} onChange={(value) => patchForm('budget', 'amount', value)} t={t} />
          <button className="primary-button" type="submit">{t('actions.saveBudget')}</button>
          <div className="economy-list">
            {budgets.length === 0 ? <p>{t('empty.noBudgets')}</p> : budgets.map((budget) => (
              <article key={budget.id}>
                <strong>{t(`categories.${budget.category}`)}</strong>
                <p>{t('budget.used', { percent: percent(budget.usedPercent), remaining: money(budget.remainingMinor, hidden, i18n.language, currency) })}</p>
                <p>{budget.status === 'over' ? t('budget.over') : budget.status === 'no-budget' ? t('budget.zero') : t('budget.inside')}</p>
                <p>{t('budget.forecastMissing')}</p>
              </article>
            ))}
          </div>
        </CrudPanel>
      )}

      {activeTab === 'debts' && (
        <CrudPanel title={t('tabs.debts')} onSubmit={submitDebt}>
          <label>{t('fields.name')}<input value={forms.debt.name} onChange={(event) => patchForm('debt', 'name', event.target.value)} /></label>
          <AmountInput label={t('fields.originalAmount')} value={forms.debt.originalAmount} onChange={(value) => patchForm('debt', 'originalAmount', value)} t={t} />
          <AmountInput label={t('fields.remainingAmount')} value={forms.debt.remainingAmount} onChange={(value) => patchForm('debt', 'remainingAmount', value)} t={t} />
          <label>{t('fields.interest')}<input inputMode="decimal" value={forms.debt.interestRate} onChange={(event) => patchForm('debt', 'interestRate', event.target.value)} /></label>
          <AmountInput label={t('fields.minimumPayment')} value={forms.debt.minimumPayment} onChange={(value) => patchForm('debt', 'minimumPayment', value)} t={t} />
          <AmountInput label={t('fields.plannedPayment')} value={forms.debt.plannedPayment} onChange={(value) => patchForm('debt', 'plannedPayment', value)} t={t} />
          <label>{t('fields.dueDay')}<input inputMode="numeric" value={forms.debt.dueDay} onChange={(event) => patchForm('debt', 'dueDay', event.target.value)} /></label>
          <label>{t('fields.startDate')}<input type="date" value={forms.debt.startDate} onChange={(event) => patchForm('debt', 'startDate', event.target.value)} /></label>
          <button className="primary-button" type="submit">{t('actions.saveDebt')}</button>
          <DebtPanel summary={debtSummary} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} t={t} />
          <div className="economy-subform">
            <h3>{t('debts.payment')}</h3>
            <DebtSelect debts={state.debts} value={forms.debtPayment.debtId} onChange={(value) => patchForm('debtPayment', 'debtId', value)} t={t} />
            <AmountInput value={forms.debtPayment.amount} onChange={(value) => patchForm('debtPayment', 'amount', value)} t={t} />
            <button className="secondary-button" type="button" onClick={submitDebtPayment}>{t('actions.confirmPayment')}</button>
          </div>
        </CrudPanel>
      )}

      {activeTab === 'bills' && (
        <CrudPanel title={t('tabs.bills')} onSubmit={submitBill}>
          <label>{t('fields.name')}<input value={forms.bill.name} onChange={(event) => patchForm('bill', 'name', event.target.value)} /></label>
          <AmountInput value={forms.bill.amount} onChange={(value) => patchForm('bill', 'amount', value)} t={t} />
          <label>{t('fields.dueDate')}<input type="date" value={forms.bill.dueDate} onChange={(event) => patchForm('bill', 'dueDate', event.target.value)} /></label>
          <CategorySelect value={forms.bill.category} onChange={(value) => patchForm('bill', 'category', value)} t={t} />
          <label>{t('fields.repeat')}<select value={forms.bill.repeat} onChange={(event) => patchForm('bill', 'repeat', event.target.value)}>{billRepeats.map((repeat) => <option value={repeat} key={repeat}>{t(`repeat.${repeat}`)}</option>)}</select></label>
          <button className="primary-button" type="submit">{t('actions.saveBill')}</button>
          <Rows rows={state.bills.map((bill) => ({ ...bill, description: `${bill.name} · ${t(`billStatus.${calculateBillStatus(bill)}`)}`, date: bill.dueDate }))} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} onDelete={(id) => setDeleteTarget(['bills', id])} t={t} />
          <button className="secondary-button" type="button" onClick={() => onCreateReminderDraft?.({ title: forms.bill.name, date: forms.bill.dueDate })}>{t('actions.reminderDraft')}</button>
          <div className="economy-subform">
            <h3>{t('subscriptions.title')}</h3>
            <label>{t('fields.name')}<input value={forms.subscription.name} onChange={(event) => patchForm('subscription', 'name', event.target.value)} /></label>
            <AmountInput value={forms.subscription.amount} onChange={(value) => patchForm('subscription', 'amount', value)} t={t} />
            <label>{t('fields.period')}<select value={forms.subscription.period} onChange={(event) => patchForm('subscription', 'period', event.target.value)}>{paymentPeriods.map((period) => <option value={period} key={period}>{t(`period.${period}`)}</option>)}</select></label>
            <label>{t('fields.nextPayment')}<input type="date" value={forms.subscription.nextPaymentDate} onChange={(event) => patchForm('subscription', 'nextPaymentDate', event.target.value)} /></label>
            <button className="secondary-button" type="button" onClick={submitSubscription}>{t('actions.saveSubscription')}</button>
          </div>
          <Rows rows={state.subscriptions.map((item) => ({ ...item, amountMinor: getSubscriptionMonthlyMinor(item), description: `${item.name} · ${money(getSubscriptionYearlyMinor(item), hidden, i18n.language, currency)} ${t('subscriptions.year')}`, date: item.nextPaymentDate }))} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} onDelete={(id) => setDeleteTarget(['subscriptions', id])} t={t} />
        </CrudPanel>
      )}

      {activeTab === 'saving' && (
        <CrudPanel title={t('tabs.saving')} onSubmit={submitSaving}>
          <label>{t('fields.name')}<input value={forms.saving.name} onChange={(event) => patchForm('saving', 'name', event.target.value)} /></label>
          <AmountInput label={t('fields.targetAmount')} value={forms.saving.targetAmount} onChange={(value) => patchForm('saving', 'targetAmount', value)} t={t} />
          <AmountInput label={t('fields.currentAmount')} value={forms.saving.currentAmount} onChange={(value) => patchForm('saving', 'currentAmount', value)} t={t} />
          <AmountInput label={t('fields.monthlyPlan')} value={forms.saving.monthlyPlan} onChange={(value) => patchForm('saving', 'monthlyPlan', value)} t={t} />
          <label>{t('fields.targetDate')}<input type="date" value={forms.saving.targetDate} onChange={(event) => patchForm('saving', 'targetDate', event.target.value)} /></label>
          <button className="primary-button" type="submit">{t('actions.saveGoal')}</button>
          <SavingRows goals={state.savingGoals} hidden={hidden} hiddenLabel={hiddenAmountLabel} currency={currency} language={i18n.language} onDelete={(id) => setDeleteTarget(['savingGoals', id])} t={t} />
          <div className="economy-subform">
            <h3>{t('saving.transaction')}</h3>
            <GoalSelect goals={state.savingGoals} value={forms.savingTransaction.goalId} onChange={(value) => patchForm('savingTransaction', 'goalId', value)} t={t} />
            <AmountInput value={forms.savingTransaction.amount} onChange={(value) => patchForm('savingTransaction', 'amount', value)} t={t} />
            <label>{t('fields.type')}<select value={forms.savingTransaction.type} onChange={(event) => patchForm('savingTransaction', 'type', event.target.value)}><option value="deposit">{t('saving.deposit')}</option><option value="withdrawal">{t('saving.withdrawal')}</option></select></label>
            <button className="secondary-button" type="button" onClick={submitSavingTransaction}>{t('actions.confirmSavingTransaction')}</button>
          </div>
        </CrudPanel>
      )}

      <section className="economy-panel economy-privacy" aria-labelledby="economy-privacy-title">
        <h2 id="economy-privacy-title">{t('privacy.storageTitle')}</h2>
        <p>{t('privacy.storage', { key: economyStorageKey, schema: economySchemaVersion, retention: economyRetentionPolicy })}</p>
        <p>{capabilities.placeholder ? t('assistant.placeholder') : ''}</p>
        {clearConfirm ? (
          <button className="secondary-button danger-button" type="button" onClick={clearAll}>{t('actions.confirmClearAll')}</button>
        ) : (
          <button className="secondary-button" type="button" onClick={() => setClearConfirm(true)}>{t('actions.clearAll')}</button>
        )}
      </section>

      {deleteTarget && (
        <div className="economy-confirm" role="alert">
          <p>{t('actions.deleteConfirm')}</p>
          <button className="secondary-button danger-button" type="button" onClick={() => removeRow(deleteTarget[0], deleteTarget[1])}>{t('actions.deleteYes')}</button>
          <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)}>{t('actions.cancel')}</button>
        </div>
      )}
    </div>
  )
}

function Metric({ hidden, hiddenLabel, label, value }) {
  return <article><span>{label}</span><SafeAmount hidden={hidden} hiddenLabel={hiddenLabel}>{value}</SafeAmount></article>
}

function SafeAmount({ children, hidden, hiddenLabel }) {
  if (!hidden) return <strong>{children}</strong>
  return <strong><span aria-hidden="true">{children}</span><span className="sr-only">{hiddenLabel}</span></strong>
}

function ExpenseWheel({ breakdown, currency, hidden, hiddenLabel, language, month, onSelect, selectedCategory, t }) {
  const total = breakdown.reduce((sum, entry) => sum + entry.amountMinor, 0)
  const segments = breakdown.reduce((result, entry, index) => {
    const value = total > 0 ? entry.amountMinor / total : 0
    const share = value * 100
    return {
      offset: result.offset + share,
      rows: [
        ...result.rows,
        { ...entry, color: colors[index], rotation: result.offset * 3.6, segment: `${share} ${100 - share}` },
      ],
    }
  }, { offset: 0, rows: [] }).rows

  return (
    <section className="economy-panel economy-wheel-panel" aria-labelledby="economy-wheel-title">
      <h2 id="economy-wheel-title">{t('wheel.title')}</h2>
      {total === 0 ? <p>{t('empty.noWheel')}</p> : (
        <div className="economy-wheel-wrap">
          <svg className="economy-wheel" viewBox="0 0 42 42" role="img" aria-labelledby="economy-wheel-title economy-wheel-description">
            <desc id="economy-wheel-description">{t('wheel.description')}</desc>
            {segments.filter((entry) => entry.amountMinor > 0).map((entry) => (
              <circle
                className={entry.category === selectedCategory ? 'is-selected' : ''}
                cx="21"
                cy="21"
                fill="transparent"
                key={entry.category}
                r="15.915"
                stroke={entry.color}
                strokeDasharray={entry.segment}
                strokeDashoffset="25"
                strokeWidth="5"
                transform={`rotate(${entry.rotation} 21 21)`}
              />
            ))}
            <text x="21" y="20" textAnchor="middle" aria-hidden={hidden ? 'true' : undefined}>{money(total, hidden, language, currency)}</text>
            <text x="21" y="24" textAnchor="middle">{month}</text>
          </svg>
          <div className="economy-legend">
            {segments.map((entry) => (
              <button className={entry.category === selectedCategory ? 'is-selected' : ''} type="button" key={entry.category} onClick={() => onSelect(entry.category)}>
                <span style={{ background: entry.color }} aria-hidden="true" />
                {t(`categories.${entry.category}`)} · <SafeAmount hidden={hidden} hiddenLabel={hiddenLabel}>{money(entry.amountMinor, hidden, language, currency)}</SafeAmount> · {percent(entry.percent)}
              </button>
            ))}
          </div>
        </div>
      )}
      <table className="sr-only">
        <caption>{t('wheel.table')}</caption>
        <tbody>{breakdown.map((entry) => <tr key={entry.category}><th>{t(`categories.${entry.category}`)}</th><td>{hidden ? hiddenLabel : money(entry.amountMinor, hidden, language, currency)}</td><td>{percent(entry.percent)}</td></tr>)}</tbody>
      </table>
    </section>
  )
}

function CrudPanel({ children, onSubmit, title }) {
  return <section className="economy-panel economy-crud"><h2>{title}</h2><form className="economy-form" onSubmit={onSubmit}>{children}</form></section>
}

function AmountInput({ label, onChange, t, value }) {
  return <label>{label || t('fields.amount')}<input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function CategorySelect({ onChange, t, value }) {
  return <label>{t('fields.category')}<select value={value} onChange={(event) => onChange(event.target.value)}>{economyCategories.map((category) => <option value={category} key={category}>{t(`categories.${category}`)}</option>)}</select></label>
}

function MoneyFormFields({ form, name, patchForm, t }) {
  return (
    <>
      <label>{t('fields.description')}<input value={form.description} onChange={(event) => patchForm(name, 'description', event.target.value)} /></label>
      <AmountInput value={form.amount} onChange={(value) => patchForm(name, 'amount', value)} t={t} />
      <label>{t('fields.date')}<input type="date" value={form.date} onChange={(event) => patchForm(name, 'date', event.target.value)} /></label>
      <CategorySelect value={form.category} onChange={(value) => patchForm(name, 'category', value)} t={t} />
      <label>{t('fields.paymentMethod')}<input value={form.paymentMethod} onChange={(event) => patchForm(name, 'paymentMethod', event.target.value)} /></label>
      <label>{t('fields.note')}<textarea rows="2" value={form.note} onChange={(event) => patchForm(name, 'note', event.target.value)} /></label>
    </>
  )
}

function Rows({ currency, hidden, hiddenLabel, language, onDelete, rows, t }) {
  if (rows.length === 0) return <p>{t('empty.noRows')}</p>
  return <ul className="economy-list">{rows.map((row) => <li key={row.id}><span>{row.date} · {row.description || row.name}</span><SafeAmount hidden={hidden} hiddenLabel={hiddenLabel}>{money(row.amountMinor, hidden, language, currency)}</SafeAmount><button type="button" onClick={() => onDelete(row.id)}>{t('actions.delete')}</button></li>)}</ul>
}

function DebtPanel({ currency, hidden, hiddenLabel, language, summary, t }) {
  return (
    <section className="economy-subpanel">
      <h3>{t('debts.summary')}</h3>
      <p>{t('debts.total', { amount: hidden ? hiddenLabel : money(summary.totalRemainingMinor, hidden, language, currency) })}</p>
      <p>{t('debts.monthly', { amount: hidden ? hiddenLabel : money(summary.monthlyPaymentMinor, hidden, language, currency) })}</p>
      <p>{summary.estimatedMonths ? t('debts.estimate', { months: summary.estimatedMonths }) : t('debts.noEstimate')}</p>
      <p>{t('debts.snowball')}: {summary.snowball.map((debt) => debt.name).join(', ') || t('empty.noDebts')}</p>
      <p>{t('debts.avalanche')}: {summary.avalanche.map((debt) => debt.name).join(', ') || t('empty.noDebts')}</p>
    </section>
  )
}

function DebtSelect({ debts, onChange, t, value }) {
  return <label>{t('fields.debt')}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('fields.choose')}</option>{debts.map((debt) => <option value={debt.id} key={debt.id}>{debt.name}</option>)}</select></label>
}

function GoalSelect({ goals, onChange, t, value }) {
  return <label>{t('fields.goal')}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('fields.choose')}</option>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.name}</option>)}</select></label>
}

function SavingRows({ currency, goals, hidden, hiddenLabel, language, onDelete, t }) {
  if (goals.length === 0) return <p>{t('empty.noSaving')}</p>
  return (
    <ul className="economy-list">
      {goals.map((goal) => {
        const status = calculateSavingGoal(goal)
        return (
          <li key={goal.id}>
            <span>{goal.name} · {percent(status.percent)} · {t('saving.remaining', { amount: hidden ? hiddenLabel : money(status.remainingMinor, hidden, language, currency) })}</span>
            <progress max="100" value={status.visualPercent}>{percent(status.visualPercent)}</progress>
            <button type="button" onClick={() => onDelete(goal.id)}>{t('actions.delete')}</button>
          </li>
        )
      })}
    </ul>
  )
}

export default EconomyCenter
