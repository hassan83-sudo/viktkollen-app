import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { nutritionFoods } from '../../services/nutrition/nutritionDatabase.js'
import useOverviewStageLock from './useOverviewStageLock.js'

const categoryLabels = {
  protein: 'Protein',
  dairy: 'Mejeri',
  carb: 'Kolhydrater',
  fruit: 'Frukt',
  vegetable: 'Grönsaker',
  fat: 'Fett',
  fast_food: 'Snabbmat',
  sweets: 'Sött',
  snack: 'Snacks',
  soda: 'Dryck',
}

function formatGrams(value) {
  if (!Number.isFinite(Number(value))) return '0'
  return Number(value).toLocaleString('sv-SE', { maximumFractionDigits: 1 })
}

function mealIngredientLines(meals = []) {
  return meals.flatMap((meal) => {
    const items = Array.isArray(meal?.ingredients) ? meal.ingredients : []
    return items.map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item?.name) {
        const amount = [item.amount, item.unit].filter(Boolean).join(' ')
        return [amount, item.name].filter(Boolean).join(' ').trim()
      }
      return String(item || '').trim()
    })
  }).filter(Boolean)
}

function OverviewFoodScanStage({ meals = [], onClose }) {
  useOverviewStageLock(onClose)
  const [query, setQuery] = useState('')
  const overlay = typeof document === 'undefined' ? null : document.body
  const todayIngredients = useMemo(() => [...new Set(mealIngredientLines(meals))], [meals])

  const groupedFoods = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv-SE')
    const filtered = nutritionFoods.filter((food) => {
      if (!needle) return true
      return food.name.toLocaleLowerCase('sv-SE').includes(needle)
        || food.aliases.some((alias) => alias.toLocaleLowerCase('sv-SE').includes(needle))
    })

    const groups = new Map()
    filtered.forEach((food) => {
      const key = food.category || 'other'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(food)
    })

    return [...groups.entries()].map(([category, items]) => ({
      category,
      label: categoryLabels[category] || category,
      items,
    }))
  }, [query])

  if (!overlay) return null

  return createPortal(
    <div className="overview-home-stage is-food" role="dialog" aria-labelledby="overview-food-stage-title" aria-modal="true">
      <div className="overview-home-stage-hero">
        <img alt="Matscanning" src="/viktkollen-meal-scan.png" />
        <button className="overview-body-scan-close" type="button" onClick={onClose}>Stäng</button>
      </div>
      <div className="overview-body-scan-panel is-ingredients">
        <p className="eyebrow">Matscanning</p>
        <h2 id="overview-food-stage-title">Ingredienser</h2>
        <p>Bläddra i matdatabasen. Kameraikonen på kortet startar en scanning.</p>
        <label className="overview-food-ingredients-search">
          <span className="sr-only">Sök ingrediens</span>
          <input
            type="search"
            value={query}
            placeholder="Sök ingrediens"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {todayIngredients.length > 0 && !query.trim() && (
          <section className="overview-food-ingredient-group">
            <h3>I dagens måltider</h3>
            <ul className="overview-food-ingredient-list">
              {todayIngredients.map((line) => (
                <li key={line}>
                  <strong>{line}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groupedFoods.map((group) => (
          <section className="overview-food-ingredient-group" key={group.category}>
            <h3>{group.label}</h3>
            <ul className="overview-food-ingredient-list">
              {group.items.map((food) => (
                <li key={food.id}>
                  <strong>{food.name}</strong>
                  <small>
                    {food.defaultServing} · {formatGrams(food.calories)} kcal · {formatGrams(food.protein)} g protein
                  </small>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {groupedFoods.length === 0 && (
          <p className="overview-body-scan-meta">Ingen ingrediens matchade sökningen.</p>
        )}

        <div className="overview-body-scan-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Tillbaka</button>
        </div>
      </div>
    </div>,
    overlay,
  )
}

export default OverviewFoodScanStage
