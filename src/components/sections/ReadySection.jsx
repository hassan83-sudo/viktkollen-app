import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AppSection from '../app/AppSection.jsx'
import { getReadyAvatar, getReadyAvatars } from '../../features/ready/readyAvatars.js'
import { getReadyGreetingKey } from '../../features/ready/readyGreeting.js'
import { getReadyLevelPolicy } from '../../features/ready/readyLevelPolicy.js'
import {
  addItem,
  createEmptyReadyState,
  extractForgotItemLabel,
  getChecklistProgress,
  getExampleItemsForLevel,
  readyLevels,
  removeItem,
  toggleItemDone,
  updateItem,
} from '../../features/ready/readyModel.js'
import { buildReadyNextEvents } from '../../features/ready/readyNextEvents.js'
import { loadReadyState, saveReadyState } from '../../features/ready/readyStore.js'
import CompanionProfilePanel from '../../features/companion/CompanionProfilePanel.jsx'
import { loadCompanionProfile, saveCompanionProfile } from '../../features/companion/companionModel.js'
import {
  getAllReadyTechniques,
  getPrimaryReadyTechniques,
} from '../../features/ready/readyTechniques.js'

const ITEM_ICONS = {
  backpack: '🎒',
  book: '📘',
  clothes: '👕',
  extra: '🧳',
  glasses: '👓',
  gym: '👟',
  laptop: '💻',
  lunch: '🍎',
  notes: '📝',
  toy: '🧸',
  water: '💧',
}

function itemIcon(icon) {
  return ITEM_ICONS[icon] || '✦'
}

function ReadySection({
  activeSection,
  onNavigateSection,
  onOpenCompanion,
  reminderState,
}) {
  const { t } = useTranslation(['ready', 'common', 'notices'])
  const [state, setState] = useState(() => loadReadyState())
  const [draftLabel, setDraftLabel] = useState('')
  const [forgotText, setForgotText] = useState('')
  const [pendingForgotLabel, setPendingForgotLabel] = useState('')
  const [editingId, setEditingId] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const [showAllTechniques, setShowAllTechniques] = useState(false)
  const [activeTechniqueId, setActiveTechniqueId] = useState('')
  const [showEyeInfo, setShowEyeInfo] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [companionProfile, setCompanionProfile] = useState(() => loadCompanionProfile())

  useEffect(() => {
    saveReadyState(state)
  }, [state])

  const policy = getReadyLevelPolicy(state.levelId)
  const progress = getChecklistProgress(state.items)
  const progressRatio = progress.total ? progress.done / progress.total : 0
  const avatar = getReadyAvatar(companionProfile.avatarId)
  const nextEvents = useMemo(
    () => buildReadyNextEvents({
      demoMode: state.demoMode,
      readyItems: state.items,
      reminderState,
    }),
    [reminderState, state.demoMode, state.items],
  )
  const primaryTechniques = getPrimaryReadyTechniques()
  const allTechniques = getAllReadyTechniques()
  const activeTechnique = allTechniques.find((technique) => technique.id === activeTechniqueId)
  const examples = getExampleItemsForLevel(state.levelId || 'mid79')
  const greeting = t(getReadyGreetingKey())

  function commitState(updater) {
    setState((current) => {
      const base = current || createEmptyReadyState()
      return typeof updater === 'function' ? updater(base) : updater
    })
  }

  function handleAddItem(label, note = '') {
    const text = String(label || '').trim()
    if (!text) return
    commitState((current) => addItem(current, { label: text, note }))
    setDraftLabel('')
    setShowExamples(false)
  }

  function handleConfirmForgot() {
    if (!pendingForgotLabel) return
    handleAddItem(pendingForgotLabel)
    setPendingForgotLabel('')
    setForgotText('')
  }

  function handleAskForgot(event) {
    event.preventDefault()
    const label = extractForgotItemLabel(forgotText)
    if (!label) return
    setPendingForgotLabel(label)
  }

  function handleDeleteConfirmed() {
    if (!deleteId) return
    commitState((current) => removeItem(current, deleteId))
    setDeleteId('')
  }

  return (
    <AppSection activeSection={activeSection} id="redo" label={t('title')}>
      <div className={`ready-shell${policy.pictureChecklist ? ' is-picture' : ''}`}>
        <header className="ready-header">
          <div>
            <h1 className="ready-title">{t('title')}</h1>
            <p className="ready-greeting">{greeting}</p>
          </div>
          <div className="ready-header-actions">
            <label className="ready-level-pill">
              <span className="sr-only">{t('levelLabel')}</span>
              <select
                aria-label={t('levelLabel')}
                value={state.levelId || ''}
                onChange={(event) => commitState((current) => ({
                  ...current,
                  levelId: event.target.value || null,
                }))}
              >
                <option value="">{t('levelPlaceholder')}</option>
                {readyLevels.map((level) => (
                  <option key={level.id} value={level.id}>{t(level.labelKey)}</option>
                ))}
              </select>
            </label>
            <button
              aria-label={t('avatar.pick')}
              className={`ready-avatar-button is-${avatar.accent}`}
              type="button"
              onClick={() => setShowAvatarPicker((open) => !open)}
            >
              <span aria-hidden="true">🤖</span>
            </button>
          </div>
        </header>

        {showAvatarPicker && (
          <section className="ready-avatar-panel" aria-label={t('avatar.pick')}>
            <p>{t('avatar.disclaimer')}</p>
            <div className="ready-avatar-grid">
              {getReadyAvatars().map((entry) => (
                <button
                  key={entry.id}
                  className={`ready-avatar-choice${companionProfile.avatarId === entry.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setCompanionProfile((current) => saveCompanionProfile({ ...current, avatarId: entry.id }))
                    setShowAvatarPicker(false)
                  }}
                >
                  <span aria-hidden="true">🤖</span>
                  <strong>{t(entry.labelKey)}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="ready-checklist-card" aria-labelledby="ready-checklist-title">
          <div className="ready-checklist-top">
            <div>
              <p className="ready-card-kicker" aria-hidden="true">☰</p>
              <h2 id="ready-checklist-title">{t('checklist.title')}</h2>
            </div>
            <div
              aria-label={t('checklist.progress', { done: progress.done, total: progress.total })}
              className="ready-progress-ring"
              style={{ '--ready-progress': progressRatio }}
            >
              <strong>{t('checklist.progressShort', { done: progress.done, total: progress.total })}</strong>
            </div>
          </div>

          {state.items.length === 0 ? (
            <div className="ready-empty">
              <p>{t('checklist.empty')}</p>
              <button className="ready-text-link" type="button" onClick={() => setShowExamples((open) => !open)}>
                {t('checklist.showExamples')}
              </button>
              {showExamples && (
                <ul className="ready-example-list">
                  {examples.map((example) => (
                    <li key={example.label}>
                      <span aria-hidden="true">{itemIcon(example.icon)}</span>
                      <span>{example.label}</span>
                      <button type="button" onClick={() => handleAddItem(example.label)}>
                        {t('checklist.useExample')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="ready-item-list">
              {state.items.map((item) => (
                <li key={item.id} className={item.done ? 'is-done' : ''}>
                  <button
                    aria-label={item.done ? t('checklist.markOpen', { label: item.label }) : t('checklist.markDone', { label: item.label })}
                    className={`ready-check${item.done ? ' is-checked' : ''}`}
                    type="button"
                    onClick={() => commitState((current) => toggleItemDone(current, item.id))}
                  >
                    {item.done ? '✓' : ''}
                  </button>
                  <div className="ready-item-copy">
                    <span className="ready-item-icon" aria-hidden="true">{itemIcon(item.icon)}</span>
                    {editingId === item.id ? (
                      <input
                        aria-label={t('checklist.editLabel')}
                        defaultValue={item.label}
                        onBlur={(event) => {
                          commitState((current) => updateItem(current, item.id, { label: event.target.value }))
                          setEditingId('')
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                      />
                    ) : (
                      <button className="ready-item-label" type="button" onClick={() => setEditingId(item.id)}>
                        <strong>{item.label}</strong>
                        {item.note ? <small>{item.note}</small> : null}
                      </button>
                    )}
                  </div>
                  <button
                    aria-label={t('checklist.deleteAria', { label: item.label })}
                    className="ready-item-delete"
                    type="button"
                    onClick={() => setDeleteId(item.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="ready-add-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleAddItem(draftLabel)
            }}
          >
            <span aria-hidden="true">+</span>
            <input
              aria-label={t('checklist.add')}
              placeholder={t('checklist.add')}
              value={draftLabel}
              onChange={(event) => setDraftLabel(event.target.value)}
            />
            <button type="submit">{t('common:actions.save')}</button>
          </form>
        </section>

        <section className="ready-forgot-card" aria-labelledby="ready-forgot-title">
          <h2 id="ready-forgot-title">{t('forgot.title')}</h2>
          <form onSubmit={handleAskForgot}>
            <label>
              <span className="sr-only">{t('forgot.input')}</span>
              <input
                placeholder={t('forgot.placeholder')}
                value={forgotText}
                onChange={(event) => setForgotText(event.target.value)}
              />
            </label>
            <button type="submit">{t('forgot.ask')}</button>
          </form>
          {pendingForgotLabel ? (
            <div className="ready-confirm" role="dialog" aria-label={t('forgot.confirm', { label: pendingForgotLabel })}>
              <p>{t('forgot.confirm', { label: pendingForgotLabel })}</p>
              <div>
                <button type="button" onClick={handleConfirmForgot}>{t('common:yes')}</button>
                <button type="button" onClick={() => setPendingForgotLabel('')}>{t('common:no')}</button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ready-ai-grid" aria-label={t('ai.gridAria')}>
          <CompanionProfilePanel onProfileChange={setCompanionProfile} surface="ready" />
          <article className="ready-ai-card is-eye">
            <h2>{t('eye.title')}</h2>
            <p>{t('eye.body')}</p>
            <div className="ready-eye-art" aria-hidden="true">◎</div>
            <button type="button" onClick={() => setShowEyeInfo(true)}>{t('eye.start')}</button>
            <p className="ready-ai-status">{t('eye.notConnected')}</p>
          </article>
          <article className="ready-ai-card is-companion">
            <h2>{t('companion.title')}</h2>
            <p>{t('companion.body')}</p>
            <div className="ready-companion-art" aria-hidden="true">🤖</div>
            <button type="button" onClick={() => onOpenCompanion?.({ source: 'ready', levelId: state.levelId })}>
              {t('companion.talk')}
            </button>
            <p className="ready-ai-status">{t('companion.aiLabel')}</p>
          </article>
        </section>

        <section className="ready-memory" aria-labelledby="ready-memory-title">
          <div className="ready-memory-head">
            <h2 id="ready-memory-title">{t('memory.title')}</h2>
            <p>{t('memory.subtitle')}</p>
          </div>
          <div className="ready-memory-grid">
            {primaryTechniques.map((technique) => (
              <button
                key={technique.id}
                type="button"
                onClick={() => setActiveTechniqueId(technique.id)}
              >
                <span aria-hidden="true">{technique.icon === 'image' ? '🖼' : technique.icon === 'book' ? '📖' : technique.icon === 'walk' ? '👣' : '🔁'}</span>
                <strong>{t(`memory.techniques.${technique.id}.title`)}</strong>
              </button>
            ))}
          </div>
          <button className="ready-text-link" type="button" onClick={() => setShowAllTechniques(true)}>
            {t('memory.showAll')}
          </button>
        </section>

        <section className="ready-next" aria-labelledby="ready-next-title">
          <h2 id="ready-next-title">{t('next.title')}</h2>
          {nextEvents.length === 0 ? (
            <div className="ready-next-empty">
              <p>{t('next.empty')}</p>
              <button type="button" onClick={() => onNavigateSection?.('notices')}>{t('next.add')}</button>
            </div>
          ) : (
            <ul>
              {nextEvents.map((event) => (
                <li key={event.id}>
                  <strong className={event.source === 'demo' ? 'is-demo' : ''}>{event.timeLabel}</strong>
                  <span>{event.title}{event.source === 'demo' ? ` (${t('next.demo')})` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {deleteId ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('checklist.deleteConfirm')}>
            <p>{t('checklist.deleteConfirm')}</p>
            <div>
              <button type="button" onClick={handleDeleteConfirmed}>{t('checklist.deleteYes')}</button>
              <button type="button" onClick={() => setDeleteId('')}>{t('common:actions.cancel')}</button>
            </div>
          </div>
        ) : null}

        {showEyeInfo ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('eye.title')}>
            <h3>{t('eye.title')}</h3>
            <p>{t('eye.notConnectedBody')}</p>
            <ul>
              <li>{t('eye.limits.visibleOnly')}</li>
              <li>{t('eye.limits.noGuarantee')}</li>
              <li>{t('eye.limits.uncertain')}</li>
              <li>{t('eye.limits.noFace')}</li>
              <li>{t('eye.limits.noChildId')}</li>
            </ul>
            <button type="button" onClick={() => setShowEyeInfo(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}

        {showAllTechniques || activeTechnique ? (
          <div className="ready-modal is-wide" role="dialog" aria-modal="true" aria-label={t('memory.title')}>
            <h3>{activeTechnique ? t(`memory.techniques.${activeTechnique.id}.title`) : t('memory.allTitle')}</h3>
            {activeTechnique ? (
              <div className="ready-technique-detail">
                <p>{t(`memory.techniques.${activeTechnique.id}.body`)}</p>
                <p>{t(`memory.techniques.${activeTechnique.id}.example`)}</p>
                {activeTechnique.comingSoon ? <p className="ready-soon">{t('memory.locationSoon')}</p> : null}
                <button type="button" onClick={() => setActiveTechniqueId('')}>{t('common:back')}</button>
              </div>
            ) : (
              <ul className="ready-technique-list">
                {allTechniques.map((technique) => (
                  <li key={technique.id}>
                    <button type="button" onClick={() => setActiveTechniqueId(technique.id)}>
                      <strong>{t(`memory.techniques.${technique.id}.title`)}</strong>
                      {technique.comingSoon ? <small>{t('memory.comingSoon')}</small> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => { setShowAllTechniques(false); setActiveTechniqueId('') }}>
              {t('common:actions.close')}
            </button>
          </div>
        ) : null}
      </div>
    </AppSection>
  )
}

export default ReadySection
