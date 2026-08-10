import { useMemo, useState } from 'react'
import {
  readDietaryPreferences,
  readMealTemplates,
  readRecipes,
} from '../../services/nutrition/nutritionEngine.js'
import { buildDailyMealPlannerModel } from '../../services/nutrition/dailyMealPlanner.js'

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
        <button type="button" onClick={() => setVariant((current) => current + 1)}>
          Generera ny plan
        </button>
      </div>

      <div className="daily-meal-planner-summary" aria-label="Planens totalsumma">
        <div><span>Kalorier</span><strong>{formatMacro(model.summary.calories, 'kcal')}</strong></div>
        <div><span>Protein</span><strong>{formatMacro(model.summary.protein, 'g')}</strong></div>
        <div><span>Kolhydrater</span><strong>{formatMacro(model.summary.carbs, 'g')}</strong></div>
        <div><span>Fett</span><strong>{formatMacro(model.summary.fat, 'g')}</strong></div>
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
          {model.shoppingGroups.map((group) => (
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

export default DailyMealPlannerCard
