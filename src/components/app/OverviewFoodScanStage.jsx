import { createPortal } from 'react-dom'
import useOverviewStageLock from './useOverviewStageLock.js'

function OverviewFoodScanStage({
  caloriesToday,
  calorieGoal,
  onClose,
  onScanFood,
  proteinGoal,
  proteinToday,
}) {
  useOverviewStageLock(onClose)
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  const calories = Number.isFinite(Number(caloriesToday)) ? Math.round(Number(caloriesToday)) : 0
  const calorieTarget = Number.isFinite(Number(calorieGoal)) && Number(calorieGoal) > 0
    ? Math.round(Number(calorieGoal))
    : null
  const protein = Number.isFinite(Number(proteinToday)) ? Math.round(Number(proteinToday)) : 0
  const proteinTarget = Number.isFinite(Number(proteinGoal)) && Number(proteinGoal) > 0
    ? Math.round(Number(proteinGoal))
    : null

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
        <dl className="overview-body-scan-facts">
          <div>
            <dt>Kalorier idag</dt>
            <dd>{calorieTarget ? `${calories} / ${calorieTarget} kcal` : `${calories} kcal`}</dd>
          </div>
          <div>
            <dt>Protein idag</dt>
            <dd>{proteinTarget ? `${protein} / ${proteinTarget} g` : `${protein} g`}</dd>
          </div>
          <div>
            <dt>Bra proteinkällor</dt>
            <dd>Kyckling, nötkött, ägg</dd>
          </div>
        </dl>
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
