import { createPortal } from 'react-dom'

function OverviewFoodScanStage({ onClose, onScanFood }) {
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  return createPortal(
    <div className="overview-home-stage is-food" role="dialog" aria-labelledby="overview-food-stage-title" aria-modal="true">
      <div className="overview-home-stage-hero">
        <img alt="Matscanning" src="/viktkollen-meal-scan.png" />
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="overview-body-scan-panel">
        <p className="eyebrow">Matscanning</p>
        <h2 id="overview-food-stage-title">Skanna maten</h2>
        <p>Ta eller välj en tydlig bild av måltiden. Analysen uppskattar portion och näring innan du sparar.</p>
        <div className="overview-body-scan-actions">
          <button className="primary-button" type="button" onClick={onScanFood}>Analysera maten</button>
          <button className="secondary-button" type="button" onClick={onClose}>Tillbaka</button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewFoodScanStage
