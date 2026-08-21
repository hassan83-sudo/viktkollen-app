import { createPortal } from 'react-dom'

function OverviewCoachStage({ advice = '', onClose, onOpenCoach }) {
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  return createPortal(
    <div className="overview-home-stage is-coach" role="dialog" aria-labelledby="overview-coach-stage-title" aria-modal="true">
      <div className="overview-home-stage-hero">
        <img alt="Viktkollens AI Coach" src="/viktkollen-ai-coach-robot.png" />
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="overview-body-scan-panel">
        <p className="eyebrow">AI Coach</p>
        <h2 id="overview-coach-stage-title">Råd från din data</h2>
        <p>{advice || 'Coach tar dina mål, måltider och vanor och ger ett konkret nästa steg.'}</p>
        <div className="overview-body-scan-actions">
          <button className="primary-button" type="button" onClick={onOpenCoach}>Öppna Coach</button>
          <button className="secondary-button" type="button" onClick={onClose}>Tillbaka</button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewCoachStage
