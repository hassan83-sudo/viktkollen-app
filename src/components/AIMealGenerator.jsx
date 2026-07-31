import { useMemo, useState } from 'react'
import {
  applyGeneratedPlanToMealPlans,
  describeGeneratedMealPlan,
  generateDayMealPlan,
  generateWeekMealPlan,
  generatedPlanToShoppingList,
  getLatestGeneratedMealPlan,
  readGeneratedMealPlans,
  readMealPlans,
  readShoppingLists,
  saveGeneratedMealPlan,
  writeMealPlans,
  writeShoppingLists,
} from '../services/nutrition/nutritionEngine.js'
import { formatCalories, formatGrams } from '../services/healthFormatting.js'

function formatNumber(value, unit) {
  if (unit === 'kcal') return formatCalories(value)
  return formatGrams(value, { unit })
}

function GeneratedMealPlanPreview({ plan }) {
  if (!plan) {
    return (
      <div className="nutrition-empty">
        <strong>Ingen förhandsgranskning ännu.</strong>
        <span>Generera en dag eller vecka för att se planen här.</span>
      </div>
    )
  }

  return (
    <div className="ai-meal-generator-preview">
      <dl className="meal-planner-summary-grid">
        <div><dt>Dagar</dt><dd>{plan.summary.dayCount}</dd></div>
        <div><dt>Måltider</dt><dd>{plan.summary.mealCount}</dd></div>
        <div><dt>Snitt protein</dt><dd>{formatNumber(plan.summary.averageProtein, 'g')}</dd></div>
        <div><dt>Snitt kalorier</dt><dd>{formatNumber(plan.summary.averageCalories, 'kcal')}</dd></div>
      </dl>
      {plan.days.map((day) => (
        <article className="ai-meal-generator-day" key={day.date}>
          <div className="nutrition-card-heading">
            <div>
              <h4>{day.date}</h4>
              <span>{formatNumber(day.totals.protein, 'g protein')} · {formatNumber(day.totals.calories, 'kcal')}</span>
            </div>
          </div>
          <div className="meal-planner-template-list">
            {day.meals.map((meal) => (
              <article key={meal.id}>
                <strong>{meal.mealType}: {meal.title}</strong>
                <span>{meal.selectionReason}</span>
              </article>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function AIMealGenerator({
  dietaryPreferences,
  nutritionGoals,
  recipes,
  templates,
}) {
  const [history, setHistory] = useState(() => readGeneratedMealPlans())
  const [preview, setPreview] = useState(() => getLatestGeneratedMealPlan(history))
  const [status, setStatus] = useState('')
  const planText = useMemo(() => describeGeneratedMealPlan(preview, nutritionGoals), [nutritionGoals, preview])

  function savePreview(plan) {
    const saved = saveGeneratedMealPlan(plan, history)
    setHistory(saved)
    setPreview(getLatestGeneratedMealPlan(saved))
    return saved
  }

  function generate(mode) {
    const plan = mode === 'week'
      ? generateWeekMealPlan({ dietaryPreferences, nutritionGoals, recipes, templates })
      : generateDayMealPlan({ dietaryPreferences, nutritionGoals, recipes, templates })

    savePreview(plan)
    setStatus(mode === 'week' ? 'Veckomeny genererad.' : 'Dagsmeny genererad.')
  }

  function sendToPlanner() {
    if (!preview) {
      setStatus('Generera en plan först.')
      return
    }

    const nextPlans = applyGeneratedPlanToMealPlans(preview, readMealPlans(), { mode: 'replace' })
    writeMealPlans(nextPlans)
    setStatus('Planen skickades till Meal Planner.')
  }

  function createShoppingList() {
    if (!preview) {
      setStatus('Generera en plan först.')
      return
    }

    const currentLists = readShoppingLists()
    const list = generatedPlanToShoppingList(preview, currentLists)
    writeShoppingLists({
      ...currentLists,
      weeks: {
        ...currentLists.weeks,
        [list.weekStart]: list,
      },
    })
    setStatus('Shopping List skapades från AI-planen.')
  }

  return (
    <section className="nutrition-card ai-meal-generator" aria-labelledby="ai-meal-generator-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">AI Meal Generator</p>
          <h3 id="ai-meal-generator-title">Automatisk meny</h3>
          <span>Deterministisk lokal planering från recept, mallar, matval och mål.</span>
        </div>
      </div>

      {status && <p className="nutrition-edit-status" role="status">{status}</p>}

      <div className="nutrition-actions">
        <button type="button" onClick={() => generate('day')}>Generera dag</button>
        <button type="button" onClick={() => generate('week')}>Generera vecka</button>
        <button className="secondary-button" type="button" onClick={sendToPlanner}>Skicka till Meal Planner</button>
        <button className="secondary-button" type="button" onClick={createShoppingList}>Skapa Shopping List</button>
      </div>

      <div className="coach-note">{planText}</div>

      <GeneratedMealPlanPreview plan={preview} />
    </section>
  )
}

export default AIMealGenerator
