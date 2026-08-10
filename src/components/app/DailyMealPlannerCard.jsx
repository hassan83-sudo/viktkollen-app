import { memo, useMemo, useState } from 'react'
import {
  readDietaryPreferences,
  readMealPlans,
  readMealTemplates,
  readRecipes,
  readShoppingLists,
} from '../../services/nutrition/nutritionEngine.js'
import {
  buildDailyMealPlannerModel,
  buildDailyMealPlannerSaveState,
  buildWeeklyShoppingGroups,
  saveDailyMealPlanToWeek,
  updateWeeklyShoppingListFromPlan,
} from '../../services/nutrition/dailyMealPlanner.js'

const mealIcons = {
  Frukost: '🥣',
  Lunch: '🥗',
  Middag: '🍽',
  Mellanmål: '🥜',
}

function formatMacro(value, unit) {
  return `${Math.round(Number(value) || 0).toLocaleString('sv-SE')} ${unit}`
}

function DailyMealPlannerCard({
  date,
  meals = [],
  nutritionGoals = {},
}) {
  const [variant, setVariant] = useState(0)
  const [mealPlans, setMealPlans] = useState(() => readMealPlans())
  const [shoppingLists, setShoppingLists] = useState(() => readShoppingLists())
  const [pendingSave, setPendingSave] = useState(false)
  const [status, setStatus] = useState('')
  const localNutritionData = useMemo(() => ({
    dietaryPreferences: readDietaryPreferences(),
    recipes: readRecipes(),
    templates: readMealTemplates(),
  }), [])
  const model = useMemo(() => buildDailyMealPlannerModel({
    date,
    dietaryPreferences: localNutritionData.dietaryPreferences,
    meals,
    nutritionGoals,
    recipes: localNutritionData.recipes,
    templates: localNutritionData.templates,
    variant,
  }), [date, localNutritionData, meals, nutritionGoals, variant])
  const saveState = useMemo(() => buildDailyMealPlannerSaveState({
    date,
    mealPlans,
    nutritionGoals,
  }), [date, mealPlans, nutritionGoals])
  const shoppingGroups = useMemo(
    () => buildWeeklyShoppingGroups({
      shoppingLists,
      week: saveState.week,
    }),
    [saveState.week, shoppingLists],
  )
  const displayShoppingGroups = saveState.weekSummary.mealCount ? shoppingGroups : model.shoppingGroups

  function persistPlan(mode = 'replace') {
    const saved = saveDailyMealPlanToWeek({
      date,
      mealPlans,
      mode,
      model,
    })
    const shopping = updateWeeklyShoppingListFromPlan({
      shoppingLists,
      week: saved.week,
    })

    setMealPlans(saved.plans)
    setShoppingLists(shopping.lists)
    setPendingSave(false)
    setStatus(mode === 'append' ? 'Planen sparades och befintliga måltider behölls.' : 'Planen sparades till veckoplanen.')
  }

  function requestSave() {
    if (saveState.dayHasPlan && !saveState.saved) {
      setPendingSave(true)
      setStatus('Det finns redan en plan för dagen. Välj om den ska ersättas eller behållas.')
      return
    }

    persistPlan('replace')
  }

  return (
    <section className="daily-meal-planner-card" aria-labelledby="daily-meal-planner-title">
      <div className="daily-meal-planner-heading">
        <div>
          <p className="eyebrow">AI Meal Planner V1</p>
          <h2 id="daily-meal-planner-title">Dagens måltidsplan</h2>
          <span>
            {model.generatedFromHistory
              ? 'Planerad från dina mål, recept, mallar och historik.'
              : 'Balanserad standardplan tills mer historik finns.'}
          </span>
        </div>
        <div className="daily-meal-planner-actions">
          <span className={saveState.saved ? 'is-saved' : 'is-unsaved'}>
            {saveState.saved ? 'Dagens plan sparad' : 'Inte sparad'}
          </span>
          <button type="button" onClick={() => setVariant((current) => current + 1)}>
            Generera ny plan
          </button>
          <button className="secondary-button" type="button" onClick={requestSave}>
            Spara till veckoplan
          </button>
        </div>
      </div>

      {status && <p className="nutrition-edit-status" role="status" aria-live="polite">{status}</p>}

      {pendingSave && (
        <div className="daily-meal-save-choice" role="group" aria-label="Spara AI-plan">
          <span>Dagen har redan planerade måltider.</span>
          <button type="button" onClick={() => persistPlan('replace')}>Ersätt</button>
          <button className="secondary-button" type="button" onClick={() => persistPlan('append')}>Behåll</button>
        </div>
      )}

      <div className="daily-meal-planner-summary" aria-label="Planens totalsumma">
        <div><span>Kalorier per dag</span><strong>{formatMacro(model.summary.calories, 'kcal')}</strong></div>
        <div><span>Protein per dag</span><strong>{formatMacro(model.summary.protein, 'g')}</strong></div>
        <div><span>Kalorier vecka</span><strong>{formatMacro(saveState.weekTotals.calories, 'kcal')}</strong></div>
        <div><span>Protein vecka</span><strong>{formatMacro(saveState.weekTotals.protein, 'g')}</strong></div>
      </div>

      <div className="daily-meal-week-summary">
        <span>{saveState.weekSummary.plannedDayCount}/7 dagar planerade</span>
        <span>{saveState.weekSummary.proteinGoalDays}/{saveState.weekSummary.plannedDayCount || 0} dagar når proteinmålet</span>
      </div>

      <div className="daily-meal-grid">
        {model.meals.map((meal) => (
          <article className="daily-meal-card" key={`${meal.mealType}-${meal.id}`}>
            <div>
              <span aria-hidden="true">{mealIcons[meal.mealType]}</span>
              <div>
                <p>{meal.mealType}</p>
                <h3>{meal.name}</h3>
              </div>
            </div>
            <dl>
              <div><dt>Kalorier</dt><dd>{formatMacro(meal.calories, 'kcal')}</dd></div>
              <div><dt>Protein</dt><dd>{formatMacro(meal.protein, 'g')}</dd></div>
              <div><dt>Kolhydrater</dt><dd>{formatMacro(meal.carbs, 'g')}</dd></div>
              <div><dt>Fett</dt><dd>{formatMacro(meal.fat, 'g')}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <article className="daily-shopping-list">
        <div>
          <p className="eyebrow">Smart Shopping</p>
          <h3>Inköpslista</h3>
        </div>
        <div className="daily-shopping-groups">
          {displayShoppingGroups.map((group) => (
            <section key={group.category}>
              <h4>{group.category}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id || `${group.category}-${item.name}`}>
                    {item.quantity ? `${item.quantity.toLocaleString('sv-SE')} ${item.unit} ` : ''}{item.name}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </section>
  )
}

export default memo(DailyMealPlannerCard)
