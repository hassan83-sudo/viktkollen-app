import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DailyNutritionSummary from './nutrition/DailyNutritionSummary.jsx'
import NutritionGoalsPanel from './nutrition/NutritionGoalsPanel.jsx'
import NutritionImportExport from './nutrition/NutritionImportExport.jsx'
import NutritionProgress from './nutritionDashboard/NutritionProgress.jsx'
import RecipeEditor from './recipe/RecipeEditor.jsx'
import { makeNutritionGoalProgress } from '../services/nutrition/nutritionEngine.js'

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function rootSource(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const dailySummary = {
  byType: [],
  highestProteinMeal: null,
  largestMeal: null,
  mealCount: 0,
  progress: {
    calories: makeNutritionGoalProgress(0, 2000, 'kcal', 'Kalorier'),
    fiber: makeNutritionGoalProgress(0, 30, 'g', 'Fibrer'),
    protein: makeNutritionGoalProgress(60, 120, 'g', 'Protein'),
  },
  totals: {
    calories: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    protein: 60,
  },
}

describe('Accessibility & Keyboard Navigation V1', () => {
  it('declares the Swedish document language', () => {
    expect(rootSource('index.html')).toContain('<html lang="sv">')
  })

  it('keeps the meal center view buttons keyboard-native and stateful', () => {
    const mealLogger = source('./MealLogger.jsx')

    expect(mealLogger).toContain('aria-pressed={nutritionViewMode ===')
    expect(mealLogger).toContain('aria-controls="nutrition-view-panel"')
    expect(mealLogger).toContain('id="nutrition-view-panel"')
  })

  it('does not use clickable divs or spans in component main flows', () => {
    const files = [
      './MealLogger.jsx',
      './ProgressCenter.jsx',
      './WeeklyMealPlanner.jsx',
      './RecipeManager.jsx',
      './AIMealGenerator.jsx',
    ]

    files.forEach((file) => {
      expect(source(file)).not.toMatch(/<(div|span)[^>]*onClick=/)
      expect(source(file)).not.toContain('role="button"')
    })
  })

  it('renders nutrition progress as real progressbars with safe values', () => {
    const markup = renderToStaticMarkup(<DailyNutritionSummary summary={dailySummary} />)

    expect(markup).toMatch(/role="progressbar"/)
    expect(markup).toMatch(/aria-valuemin="0"/)
    expect(markup).toMatch(/aria-valuemax="100"/)
    expect(markup).toMatch(/aria-valuetext="0 procent"/)
    expect(markup).not.toMatch(/undefined%|NaN%|Infinity%/)
  })

  it('renders dashboard nutrition progress with progressbar semantics', () => {
    const progress = makeNutritionGoalProgress(150, 100, 'g', 'Protein')
    const markup = renderToStaticMarkup(<NutritionProgress progress={progress} />)

    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuemax="100"')
    expect(markup).toContain('aria-valuenow="100"')
    expect(markup).toContain('aria-valuetext=')
  })

  it('names hidden JSON file inputs and announces import status', () => {
    const markup = renderToStaticMarkup(
      <NutritionImportExport
        fileInputRef={{ current: null }}
        importStatus="Kostdata importerad."
        onExport={() => {}}
        onFileChange={() => {}}
        onOpenImport={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Välj säkerhetskopia med kostdata"')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
  })

  it('connects nutrition goal validation errors to their fields', () => {
    const markup = renderToStaticMarkup(
      <NutritionGoalsPanel
        draft={{ protein: '', calories: '', carbs: '', fat: '', fiber: '' }}
        errors={{ protein: 'Ange ett giltigt proteinmål.' }}
        proteinDistributionPlan={null}
        suggestedCalorieGoal={null}
        suggestedProteinGoal={null}
        onCancel={() => {}}
        onChange={() => {}}
        onClear={() => {}}
        onSave={() => {}}
        onUseSuggestedCalorieGoal={() => {}}
        onUseSuggestedProteinGoal={() => {}}
      />,
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain('aria-describedby="protein-goal-error"')
    expect(markup).toContain('id="protein-goal-error"')
  })

  it('connects recipe validation errors to their inputs', () => {
    const draft = {
      category: 'Middag',
      cookingTimeMinutes: 30,
      description: '',
      ingredients: [],
      instructions: '',
      name: '',
      servings: 0,
      tags: '',
    }
    const markup = renderToStaticMarkup(
      <RecipeEditor
        draft={draft}
        errors={{ name: 'Namn krävs.', servings: 'Portioner krävs.' }}
        mode="new"
        onCancel={() => {}}
        onChange={() => {}}
        onSubmit={() => {}}
      />,
    )

    expect(markup).toContain('aria-describedby="recipe-name-error"')
    expect(markup).toContain('aria-describedby="recipe-servings-error"')
    expect(markup).toContain('aria-invalid="true"')
  })

  it('keeps global focus-visible styling for textarea fields', () => {
    expect(rootSource('src/App.css')).toMatch(/textarea:focus-visible/)
  })

  it('documents the accessibility contract', () => {
    const doc = rootSource('docs/accessibility-keyboard-v1.md')

    expect(doc).toContain('role="status"')
    expect(doc).toContain('role="progressbar"')
    expect(doc).toContain('aria-describedby')
  })
})
