import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function HomeNoticeShortcuts({ onOpenNotices }) {
  const [target, setTarget] = useState(null)
  const shortcuts = [
    { id: 'timer', label: 'Timer' },
    { id: 'alarm', label: 'Väckarklocka' },
    { id: 'reminder', label: 'Påminnelse' },
    { id: 'bathroom', label: 'Badrum' },
  ]

  useEffect(() => {
    setTarget(document.querySelector('.overview-today-mood'))

    // Keep the lower part of Home compact. The user opens only the section
    // they wants to inspect instead of seeing every long card at once.
    document.querySelectorAll('.overview-secondary-details').forEach((section) => {
      section.open = false
    })
  }, [])

  if (!target) return null

  return createPortal(
    <>
      <style>{`
        .overview-today-mood > .is-quick {
          order: 4;
        }
        .overview-today-mood > .is-today {
          order: 5;
          grid-column: 1 / -1;
        }
        .overview-mood-card.is-quick {
          align-items: flex-start;
          gap: 10px;
        }
        .overview-quick-head {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .overview-quick-head button,
        .overview-quick-buttons button {
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #22c7e8, #815cf6);
          color: #06111f;
          cursor: pointer;
          font: inherit;
        }
        .overview-quick-head button {
          padding: 7px 10px;
          font-size: 12px;
          white-space: nowrap;
        }
        .overview-quick-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          width: 100%;
        }
        .overview-quick-buttons button {
          padding: 8px 10px;
          font-size: 12px;
        }
        .overview-more-section {
          display: grid;
          gap: 8px;
        }
        .overview-more-section > h2 {
          margin-bottom: 2px;
        }
        .overview-secondary-details:not([open]) {
          margin-block: 0;
        }
        .overview-secondary-details:not([open]) > summary {
          min-height: 48px;
        }
      `}</style>
      <article className="overview-mood-card is-quick" aria-label="Snabbknappar för Notis">
        <div className="overview-quick-head">
          <span className="overview-mood-label">Snabbt</span>
          <button type="button" onClick={() => onOpenNotices?.()}>Alla notiser</button>
        </div>
        <div className="overview-quick-buttons" aria-label="Viktiga snabbknappar">
          {shortcuts.map((shortcut) => (
            <button key={shortcut.id} type="button" onClick={() => onOpenNotices?.(shortcut.id)}>
              {shortcut.label}
            </button>
          ))}
        </div>
      </article>
    </>,
    target,
  )
}

export default HomeNoticeShortcuts
