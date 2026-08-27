import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { getNutritionFoodById } from '../../services/nutrition/nutritionDatabase.js'
import useOverviewStageLock from './useOverviewStageLock.js'

const plateIngredientIds = ['kyckling', 'avokado', 'broccoli', 'tomat']

const extraPlateIngredients = [
  { id: 'quinoa', name: 'Quinoa', defaultServing: '80 g kokt', calories: 96, protein: 3.4 },
  { id: 'kikartor', name: 'Kikärtor', defaultServing: '40 g', calories: 66, protein: 3.5 },
  { id: 'rodlok', name: 'Rödlök', defaultServing: '20 g', calories: 8, protein: 0.2 },
  { id: 'spenat', name: 'Spenat', defaultServing: '30 g', calories: 7, protein: 0.9 },
  { id: 'citron', name: 'Citron', defaultServing: '1 klyfta', calories: 4, protein: 0.1 },
]

function formatGrams(value, locale) {
  if (!Number.isFinite(Number(value))) return '0'
  return Number(value).toLocaleString(locale, { maximumFractionDigits: 1 })
}

function getPlateIngredients() {
  const fromDatabase = plateIngredientIds.map((id) => getNutritionFoodById(id)).filter(Boolean)
  return [...fromDatabase, ...extraPlateIngredients]
}

function OverviewFoodScanStage({ onClose }) {
  const { t, i18n } = useTranslation(['home', 'common', 'bodyScan'])
  useOverviewStageLock(onClose)
  const overlay = typeof document === 'undefined' ? null : document.body
  if (!overlay) return null

  const ingredients = getPlateIngredients()
  const locale = i18n.language || 'sv-SE'

  return createPortal(
    <div className="overview-home-stage is-food" role="dialog" aria-labelledby="overview-food-stage-title" aria-modal="true">
      <div className="overview-home-stage-hero is-full-art">
        <img alt={t('foodScan.mealScanAlt')} src="/viktkollen-meal-scan.png" />
        <button className="overview-body-scan-close" type="button" onClick={onClose}>{t('common:actions.close')}</button>
      </div>
      <div className="overview-body-scan-panel is-ingredients">
        <p className="eyebrow">{t('foodScan.title')}</p>
        <h2 id="overview-food-stage-title">{t('foodScan.onPlate')}</h2>
        <p>{t('foodScan.plateHint')}</p>
        <ul className="overview-food-ingredient-list">
          {ingredients.map((food) => (
            <li key={food.id}>
              <strong>{food.name}</strong>
              <small>
                {food.defaultServing} · {formatGrams(food.calories, locale)} kcal · {formatGrams(food.protein, locale)} g protein
              </small>
            </li>
          ))}
        </ul>
        <div className="overview-body-scan-actions">
          <button className="secondary-button" type="button" onClick={onClose}>{t('common:back')}</button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewFoodScanStage
export const overviewFoodScanStageInternals = {
  getPlateIngredients,
}
