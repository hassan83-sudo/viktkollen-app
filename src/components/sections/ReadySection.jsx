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
  removeItem,
  toggleItemDone,
  updateItem,
} from '../../features/ready/readyModel.js'
import { buildReadyNextEvents } from '../../features/ready/readyNextEvents.js'
import { loadReadyState, saveReadyState } from '../../features/ready/readyStore.js'
import CompanionProfilePanel from '../../features/companion/CompanionProfilePanel.jsx'
import { loadCompanionProfile, saveCompanionProfile } from '../../features/companion/companionModel.js'
import { getAllReadyTechniques } from '../../features/ready/readyTechniques.js'
import ReadyHeader from './ready/ReadyHeader.jsx'
import ReadyChecklistCard from './ready/ReadyChecklistCard.jsx'
import ForgotSomethingCard from './ready/ForgotSomethingCard.jsx'
import AiCompanionCard from './ready/AiCompanionCard.jsx'
import ReadyQuickActions from './ready/ReadyQuickActions.jsx'
import NextCard from './ready/NextCard.jsx'
import ReminderCard from './ready/ReminderCard.jsx'

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
  const [showCompanionProfile, setShowCompanionProfile] = useState(false)
  const [showNextList, setShowNextList] = useState(false)
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

  function handleNextCardOpen() {
    if (nextEvents.length === 0) {
      onNavigateSection?.('notices')
      return
    }
    setShowNextList(true)
  }

  return (
    <AppSection activeSection={activeSection} id="redo" label={t('title')}>
      <div className={`ready-shell${policy.pictureChecklist ? ' is-picture' : ''}`}>
        <ReadyHeader
          greeting={greeting}
          levelId={state.levelId}
          onLevelChange={(levelId) => commitState((current) => ({ ...current, levelId }))}
          avatar={avatar}
          onAvatarClick={() => setShowAvatarPicker((open) => !open)}
        />

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

        <ReadyChecklistCard
          progress={progress}
          progressRatio={progressRatio}
          items={state.items}
          editingId={editingId}
          onStartEdit={setEditingId}
          onCommitEdit={(id, label) => {
            commitState((current) => updateItem(current, id, { label }))
            setEditingId('')
          }}
          onToggleDone={(id) => commitState((current) => toggleItemDone(current, id))}
          onDeleteRequest={setDeleteId}
          showExamples={showExamples}
          onToggleExamples={() => setShowExamples((open) => !open)}
          examples={examples}
          onUseExample={handleAddItem}
          draftLabel={draftLabel}
          onDraftChange={setDraftLabel}
          onSubmitAdd={handleAddItem}
        />

        <ForgotSomethingCard
          forgotText={forgotText}
          onForgotTextChange={setForgotText}
          onSubmit={handleAskForgot}
          pendingForgotLabel={pendingForgotLabel}
          onConfirm={handleConfirmForgot}
          onCancel={() => setPendingForgotLabel('')}
        />

        <AiCompanionCard onOpen={() => setShowCompanionProfile(true)} />

        <ReadyQuickActions
          onOpenProfile={() => setShowCompanionProfile(true)}
          onOpenEye={() => setShowEyeInfo(true)}
          onOpenMemory={() => setShowAllTechniques(true)}
        />

        <div className="ready-bottom-row">
          <NextCard nextEvents={nextEvents} onOpen={handleNextCardOpen} />
          <ReminderCard onOpen={() => onNavigateSection?.('notices')} />
        </div>

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

        {showCompanionProfile ? (
          <div className="ready-modal is-wide ready-companion-modal" role="dialog" aria-modal="true" aria-label={t('companion.cardTitle')}>
            <CompanionProfilePanel onProfileChange={setCompanionProfile} surface="ready" />
            <article className="ready-ai-card is-companion">
              <h2>{t('companion.title')}</h2>
              <p>{t('companion.body')}</p>
              <div className="ready-companion-art" aria-hidden="true">🤖</div>
              <button type="button" onClick={() => onOpenCompanion?.({ source: 'ready', levelId: state.levelId })}>
                {t('companion.talk')}
              </button>
              <p className="ready-ai-status">{t('companion.aiLabel')}</p>
            </article>
            <button type="button" onClick={() => setShowCompanionProfile(false)}>
              {t('common:actions.close')}
            </button>
          </div>
        ) : null}

        {showNextList ? (
          <div className="ready-modal" role="dialog" aria-modal="true" aria-label={t('next.title')}>
            <h3>{t('next.title')}</h3>
            <div className="ready-next">
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
            </div>
            <button type="button" onClick={() => setShowNextList(false)}>{t('common:actions.close')}</button>
          </div>
        ) : null}
      </div>
    </AppSection>
  )
}

export default ReadySection
