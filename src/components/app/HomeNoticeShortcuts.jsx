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
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-areas:
            "quick quick"
            "wellbeing coach"
            "reminder notices"
            "today today";
        }
        #app-section-home.is-active .overview-today-mood > .is-wellbeing {
          grid-area: wellbeing;
          min-width: 0;
        }
        #app-section-home.is-active .overview-today-mood > .is-coach {
          grid-area: coach;
          min-width: 0;
        }
        #app-section-home.is-active .overview-today-mood > .is-quick {
          grid-area: quick;
          width: 100%;
          min-width: 0;
        }
        #app-section-home.is-active .overview-today-mood > .is-reminder {
          grid-area: reminder;
          min-width: 0;
        }
        #app-section-home.is-active .overview-today-mood > .is-notices {
          grid-area: notices;
          min-width: 0;
        }
        #app-section-home.is-active .overview-today-mood > .is-today {
          grid-area: today;
          min-width: 0;
        }
        .overview-mood-card.is-quick {
          align-items: stretch;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(144, 125, 255, 0.24);
          border-radius: 20px;
          background:
            radial-gradient(circle at 88% 0%, rgba(111, 92, 246, 0.16), transparent 42%),
            linear-gradient(145deg, rgba(18, 22, 38, 0.96), rgba(11, 15, 28, 0.96));
          box-shadow: 0 12px 30px rgba(3, 8, 20, 0.18);
        }
        .overview-quick-head {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .overview-mood-card.is-quick .overview-mood-label {
          color: rgba(224, 231, 255, 0.72);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
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
          padding: 8px 12px;
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
          min-height: 38px;
          padding: 9px 8px;
          font-size: 12px;
        }
        .overview-quick-head button:focus-visible,
        .overview-quick-buttons button:focus-visible {
          outline: 2px solid #79e7f2;
          outline-offset: 3px;
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
          .overview-mood-card.is-quick {
            padding: 12px;
            border-radius: 18px;
          }
          .overview-quick-buttons {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
      <article className="overview-mood-card is-quick" aria-label="Snabbt">
        <div className="overview-quick-head">
          <span className="overview-mood-label">Snabbt</span>
          <button type="button" onClick={() => onOpenNotices?.()}>Alla notiser</button>
        </div>
        <div className="overview-quick-buttons" role="group" aria-label="Viktiga snabbknappar">
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
