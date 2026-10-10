import { useMemo, useState } from 'react'

import { itemBankCatalogSize } from '../itemBankCatalog.js'
import {
  addCustomItem,
  getCategoryOptions,
  getItemStatus,
  getSelectedItems,
  isSelected,
  itemBankVisionReady,
  itemStatusLabels,
  itemStatuses,
  maxCustomLabelLength,
  removeCustomItem,
  resetCarried,
  searchItems,
  setCarried,
  summarizeStatuses,
  toggleSelected,
} from '../itemBankModel.js'
import { getItemBankStorageKey, loadItemBankState, saveItemBankState } from '../itemBankStore.js'
import QuickCheckSlideshow from './QuickCheckSlideshow.jsx'
import '../itemBank.css'

const tabs = [
  { id: 'mine', label: 'Mina saker' },
  { id: 'bank', label: 'Sakbank' },
  { id: 'quick', label: 'Snabbkoll' },
]

function BankTab({ onChange, state }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const results = useMemo(() => searchItems(state, { category, query }), [state, category, query])

  function addOwn() {
    const result = addCustomItem(state, { label: draft })
    setError(result.error)
    if (result.error) return
    onChange(result.state)
    setDraft('')
  }

  return (
    <>
      <input
        aria-label="Sök sak"
        className="item-bank-search"
        placeholder={`Sök bland ${itemBankCatalogSize} saker`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <nav className="item-bank-categories" aria-label="Kategorier">
        {getCategoryOptions(state).map((option) => (
          <button
            key={option.id}
            aria-pressed={category === option.id}
            className={category === option.id ? 'is-active' : ''}
            type="button"
            onClick={() => setCategory(option.id)}
          >
            <span aria-hidden="true">{option.icon}</span> {option.label}
          </button>
        ))}
      </nav>
      <p className="item-bank-count" aria-live="polite">{results.length} saker · {state.selectedIds.length} valda</p>
      {results.length
        ? (
          <ul className="item-bank-grid">
            {results.map((item) => {
              const selected = isSelected(state, item.id)
              return (
                <li key={item.id}>
                  <button
                    aria-pressed={selected}
                    className={`item-bank-tile${selected ? ' is-selected' : ''}`}
                    type="button"
                    onClick={() => onChange(toggleSelected(state, item.id))}
                  >
                    <span className="item-bank-tile-icon" aria-hidden="true">{item.icon}</span>
                    <strong>{item.label}</strong>
                    {selected && <small>✓ Vald</small>}
                  </button>
                </li>
              )
            })}
          </ul>
        )
        : <p className="smart-camera-note">Ingen sak matchar. Lägg till den som egen sak nedan.</p>}
      <div className="item-bank-add">
        <h3>Lägg till egen sak</h3>
        <div className="smart-camera-add-row">
          <input
            aria-label="Namn på egen sak"
            maxLength={maxCustomLabelLength}
            placeholder={query ? query : 't.ex. Gitarr'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') addOwn() }}
          />
          <button className="secondary-button" type="button" onClick={addOwn}>Lägg till</button>
        </div>
        {error && <p className="item-bank-error" role="alert">{error}</p>}
      </div>
    </>
  )
}

function StatusBadge({ status }) {
  return <span className={`item-bank-status is-${status}`}>{itemStatusLabels[status]}</span>
}

function MineTab({ onAddToCarryList, onChange, onGoToBank, onOpenCamera, state }) {
  const items = getSelectedItems(state)
  const summary = summarizeStatuses(state)
  const [synced, setSynced] = useState(false)

  if (!items.length) {
    return (
      <div className="item-bank-empty">
        <p>Du har inga valda saker ännu.</p>
        <button className="primary-button" type="button" onClick={onGoToBank}>Välj i Sakbanken</button>
      </div>
    )
  }

  return (
    <>
      <div className="item-bank-legend">
        <span><StatusBadge status={itemStatuses.selected} /> {summary[itemStatuses.selected]}</span>
        <span><StatusBadge status={itemStatuses.carried} /> {summary[itemStatuses.carried]}</span>
        <span><StatusBadge status={itemStatuses.aiVerified} /> {summary[itemStatuses.aiVerified]}</span>
      </div>
      <p className="smart-camera-note">
        <strong>Vald</strong> = du har valt saken. <strong>Medtagen</strong> = du har själv bockat av den.
        {' '}<strong>AI-verifierad</strong> visas bara när en riktig bildanalys har sett saken
        {itemBankVisionReady ? '.' : ' – den analysen är inte aktiv ännu, så ingen sak är AI-verifierad.'}
      </p>
      <ul className="item-bank-list">
        {items.map((item) => {
          const status = getItemStatus(state, item.id)
          const carried = status === itemStatuses.carried || Boolean(state.status[item.id]?.carried)
          return (
            <li key={item.id}>
              <span className="item-bank-list-icon" aria-hidden="true">{item.icon}</span>
              <label>
                <input
                  checked={carried}
                  type="checkbox"
                  onChange={() => onChange(setCarried(state, item.id, !carried))}
                />
                <span>{item.label}</span>
              </label>
              <StatusBadge status={status} />
              <button
                aria-label={`Ta bort ${item.label}`}
                className="item-bank-remove"
                type="button"
                onClick={() => onChange(item.custom ? removeCustomItem(state, item.id) : toggleSelected(state, item.id))}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
      <div className="item-bank-actions">
        <button className="secondary-button" type="button" onClick={() => onChange(resetCarried(state))}>Nollställ medtaget</button>
        {onAddToCarryList && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onAddToCarryList(items.map((item) => item.label))
              setSynced(true)
            }}
          >
            Lägg i ta-med-listan
          </button>
        )}
        {onOpenCamera && (
          <button className="secondary-button" type="button" onClick={onOpenCamera}>📷 Kolla med AI-Ögat</button>
        )}
      </div>
      {synced && <p className="smart-camera-note" role="status">Sakerna finns nu i din ta-med-lista i AI-Ögat.</p>}
    </>
  )
}

export default function ItemBankMode({ onAddToCarryList, onOpenCamera, scope }) {
  const [state, setState] = useState(() => loadItemBankState(scope))
  const [tab, setTab] = useState(() => (state.selectedIds.length ? 'mine' : 'bank'))
  const canPersist = Boolean(getItemBankStorageKey(scope))

  function persist(next) {
    setState(saveItemBankState(next, scope).state)
  }

  return (
    <div className="item-bank">
      <nav className="item-bank-tabs" role="tablist" aria-label="Sakbank">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'is-active' : ''}
            role="tab"
            type="button"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.id === 'mine' && state.selectedIds.length > 0 && <span className="item-bank-tab-count">{state.selectedIds.length}</span>}
          </button>
        ))}
      </nav>
      {!canPersist && <p className="smart-camera-note" role="status">Din lista sparas när inloggningen är klar.</p>}
      <div role="tabpanel">
        {tab === 'bank' && <BankTab state={state} onChange={persist} />}
        {tab === 'mine' && (
          <MineTab
            state={state}
            onAddToCarryList={onAddToCarryList}
            onChange={persist}
            onGoToBank={() => setTab('bank')}
            onOpenCamera={onOpenCamera}
          />
        )}
        {tab === 'quick' && (
          <QuickCheckSlideshow
            items={getSelectedItems(state)}
            speedId={state.speed}
            onSpeedChange={(speed) => persist({ ...state, speed })}
          />
        )}
      </div>
    </div>
  )
}
