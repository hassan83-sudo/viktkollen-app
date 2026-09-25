import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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

function ReadyChecklistCard({
  progress,
  progressRatio,
  items,
  editingId,
  onStartEdit,
  onCommitEdit,
  onToggleDone,
  onDeleteRequest,
  showExamples,
  onToggleExamples,
  examples,
  onUseExample,
  draftLabel,
  onDraftChange,
  onSubmitAdd,
}) {
  const { t } = useTranslation(['ready', 'common'])
  // A11Y-8Q (8M B6): an empty or blank item is not saved, and the user is
  // told why: a visible message in a polite status region, linked to the
  // field with aria-describedby and marked with aria-invalid until the text
  // is changed. Focus stays where the user submitted from.
  const [addError, setAddError] = useState('')

  return (
    <section className="ready-checklist-card" aria-labelledby="ready-checklist-title">
      <div className="ready-checklist-top">
        <div>
          <p className="ready-card-kicker" aria-hidden="true">☰</p>
          <h2 id="ready-checklist-title">{t('checklist.title')}</h2>
        </div>
        <div
          className="ready-progress-ring"
          style={{ '--ready-progress': progressRatio }}
        >
          <strong>{t('checklist.progressShort', { done: progress.done, total: progress.total })}</strong>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="ready-empty">
          <p>{t('checklist.empty')}</p>
          <button className="ready-text-link" type="button" onClick={onToggleExamples}>
            {t('checklist.showExamples')}
          </button>
          {showExamples && (
            <ul className="ready-example-list">
              {examples.map((example) => (
                <li key={example.label}>
                  <span aria-hidden="true">{itemIcon(example.icon)}</span>
                  <span>{example.label}</span>
                  <button type="button" onClick={() => onUseExample(example.label)}>
                    {t('checklist.useExample')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="ready-item-list">
          {items.map((item) => (
            <li key={item.id} className={item.done ? 'is-done' : ''}>
              <button
                aria-label={item.done ? t('checklist.markOpen', { label: item.label }) : t('checklist.markDone', { label: item.label })}
                className={`ready-check${item.done ? ' is-checked' : ''}`}
                type="button"
                onClick={() => onToggleDone(item.id)}
              >
                {item.done ? '✓' : ''}
              </button>
              <div className="ready-item-copy">
                <span className="ready-item-icon" aria-hidden="true">{itemIcon(item.icon)}</span>
                {editingId === item.id ? (
                  <input
                    aria-label={t('checklist.editLabel')}
                    defaultValue={item.label}
                    onBlur={(event) => onCommitEdit(item.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                ) : (
                  <button className="ready-item-label" type="button" onClick={() => onStartEdit(item.id)}>
                    <strong>{item.label}</strong>
                    {item.note ? <small>{item.note}</small> : null}
                  </button>
                )}
              </div>
              <button
                aria-label={t('checklist.deleteAria', { label: item.label })}
                className="ready-item-delete"
                type="button"
                onClick={() => onDeleteRequest(item.id)}
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
          if (!String(draftLabel || '').trim()) {
            setAddError(t('checklist.emptyError'))
            return
          }
          setAddError('')
          onSubmitAdd(draftLabel)
        }}
      >
        <span aria-hidden="true">+</span>
        <input
          aria-describedby={addError ? 'ready-add-error' : undefined}
          aria-invalid={addError ? true : undefined}
          aria-label={t('checklist.add')}
          placeholder={t('checklist.add')}
          value={draftLabel}
          onChange={(event) => {
            if (addError) setAddError('')
            onDraftChange(event.target.value)
          }}
        />
        <button type="submit">{t('common:actions.save')}</button>
      </form>
      <p className="ready-add-error" id="ready-add-error" role="status">{addError}</p>
    </section>
  )
}

export default ReadyChecklistCard
