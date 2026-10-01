import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function HomeNoticeShortcuts({ onOpenCoach, onOpenWellbeing }) {
  const [target, setTarget] = useState(null)

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
            "quick quick"
            "reminder notices"
            "today today";
        }
        #app-section-home.is-active .overview-today-mood > .is-quick {
          grid-area: quick;
          width: 100%;
        }
        #app-section-home.is-active .overview-today-mood > .is-today {
          grid-area: today;
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
        .overview-quick-buttons {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          width: 100%;
        }
        .overview-quick-buttons button {
          position: relative;
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 68px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          color: #f8fbff;
          cursor: pointer;
          font: inherit;
          font-size: 14px;
          font-weight: 750;
          text-align: left;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .overview-quick-buttons button::before {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          font-size: 18px;
          line-height: 1;
        }
        .overview-quick-buttons button::after {
          content: "›";
          content: "›" / "";
          color: rgba(255, 255, 255, 0.68);
          font-size: 22px;
          font-weight: 500;
          line-height: 1;
        }
        .overview-quick-wellbeing {
          background: linear-gradient(135deg, rgba(21, 83, 76, 0.88), rgba(18, 48, 54, 0.94));
          border-color: rgba(79, 225, 187, 0.24) !important;
        }
        .overview-quick-wellbeing::before {
          content: "♥";
          content: "♥" / "";
          background: rgba(87, 230, 190, 0.14);
          color: #72edc7;
        }
        .overview-quick-coach {
          background: linear-gradient(135deg, rgba(65, 47, 132, 0.9), rgba(35, 33, 78, 0.96));
          border-color: rgba(157, 124, 255, 0.3) !important;
        }
        .overview-quick-coach::before {
          content: "✦";
          content: "✦" / "";
          background: rgba(171, 137, 255, 0.15);
          color: #c5adff;
        }
        .overview-quick-buttons button:hover {
          border-color: rgba(255, 255, 255, 0.24) !important;
          box-shadow: 0 10px 24px rgba(4, 8, 20, 0.2);
          transform: translateY(-1px);
        }
        .overview-quick-buttons button:focus-visible {
          outline: 2px solid #79e7f2;
          outline-offset: 3px;
        }
        .overview-quick-buttons button:active {
          transform: translateY(0);
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
            gap: 8px;
          }
          .overview-quick-buttons button {
            grid-template-columns: 34px minmax(0, 1fr) auto;
            gap: 8px;
            min-height: 62px;
            padding: 9px 10px;
            border-radius: 14px;
            font-size: 13px;
          }
          .overview-quick-buttons button::before {
            width: 34px;
            height: 34px;
            border-radius: 11px;
            font-size: 16px;
          }
        }
        @media (max-width: 340px) {
          .overview-quick-buttons {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .overview-quick-buttons button {
            transition: none;
          }
        }
      `}</style>
      <article className="overview-mood-card is-quick" aria-label="Snabbt">
        <div className="overview-quick-head">
          <span className="overview-mood-label">Snabbt</span>
        </div>
        <div className="overview-quick-buttons" role="group" aria-label="Må bra och AI Coach">
          <button className="overview-quick-wellbeing" type="button" onClick={() => onOpenWellbeing?.()}>Må bra</button>
          <button className="overview-quick-coach" type="button" onClick={() => onOpenCoach?.()}>AI Coach</button>
        </div>
      </article>
    </>,
    target,
  )
}

export default HomeNoticeShortcuts
