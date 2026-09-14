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

    document.querySelectorAll('.overview-secondary-details').forEach((section) => {
      section.open = false
    })
  }, [])

  if (!target) return null

  return createPortal(
    <>
      <style>{`
        #app-section-home.is-active .overview-today-mood {
          grid-template-areas:
            "wellbeing coach"
            "quick quick"
            "reminder today";
        }
        #app-section-home.is-active .overview-today-mood > .is-quick {
          grid-area: quick;
          width: 100%;
        }
        #app-section-home.is-active .overview-today-mood > .is-today {
          grid-area: today;
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
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
          width: 100%;
        }
        .overview-quick-buttons button {
          width: 100%;
          padding: 9px 8px;
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
        @media (max-width: 390px) {
          .overview-quick-buttons {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
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
