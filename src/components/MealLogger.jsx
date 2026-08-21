import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  favoriteToMeal,
  getCurrentTimeString,
  getEmptyMeal,
  getTodayDateString,
  getWeekStart,
  mealDraftToMeal,
  normalizeFavoriteMeal,
  normalizeMeals,
  normalizeNutritionGoals,
  parseNutritionImport,
  summarizeDay,
  summarizeWeek,
  validateMealDraft,
  buildNutritionInsights,
  exportNutritionData,
} from '../services/nutritionService.js'
import {
  filterAndSortMeals,
  getHistoryRangeBounds,
  historyRangeOptions,
  summarizeMeals,
} from '../services/nutrition/mealHistoryRange.js'
import DailyNutritionSummary from './nutrition/DailyNutritionSummary.jsx'
import DietaryPreferencesPanel from './nutrition/DietaryPreferencesPanel.jsx'
import FavoriteMeals from './nutrition/FavoriteMeals.jsx'
import MealEditor from './nutrition/MealEditor.jsx'
import MealHistory from './nutrition/MealHistory.jsx'
import NutritionGoalsPanel from './nutrition/NutritionGoalsPanel.jsx'
import NutritionImportExport from './nutrition/NutritionImportExport.jsx'
import NutritionInsights from './nutrition/NutritionInsights.jsx'
import WeeklyNutritionAnalysis from './nutrition/WeeklyNutritionAnalysis.jsx'
import MealHistoryTools from './MealHistoryTools.jsx'
import MealEditForm from './mealEditor/MealEditForm.jsx'
import MealQuickAdd from './mealTemplates/MealQuickAdd.jsx'
import MealWeeklyReport from './MealWeeklyReport.jsx'
import NutritionActionPlan from './NutritionActionPlan.jsx'
import MealReviewPanel from './nutritionDataQuality/MealReviewPanel.jsx'
import NutritionDashboard from './NutritionDashboard.jsx'
import PhotoAnalysis from './PhotoAnalysis.jsx'
import {
  createMealEditDraft,
  createMealTemplate,
  createMealTemplateFromMeal,
  calculateSuggestedCalorieGoal,
  calculateSuggestedProteinGoal,
  buildProteinDistributionPlan,
  buildMealQualityReviewModel,
  createMealFromTemplate,
  createUpdatedNutritionGoals,
  createUpdatedMealRecord,
  clearDietaryPreferences,
  readMealTemplates,
  readRecipes,
  readDietaryPreferences,
  resetMealNutritionOverride,
  writeDietaryPreferences,
  validateMealEditDraft,
  writeMealTemplates,
  writeRecipes,
} from '../services/nutrition/nutritionEngine.js'

const AIMealGenerator = lazy(() => import('./AIMealGenerator.jsx'))
const MonthlyNutritionDashboard = lazy(() => import('./MonthlyNutritionDashboard.jsx'))
const NutritionScannerV2 = lazy(() => import('./NutritionScannerV2.jsx'))
const RecipeManager = lazy(() => import('./RecipeManager.jsx'))
const WeeklyMealPlanner = lazy(() => import('./WeeklyMealPlanner.jsx'))
const WeeklyNutritionDashboard = lazy(() => import('./WeeklyNutritionDashboard.jsx'))

const defaultFilters = {
  from: '',
  provenance: 'Alla',
  search: '',
  sort: 'newest',
  source: 'Alla',
  to: '',
  type: 'Alla',
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function scrollTargetInAppContainer(target) {
  const scrollContainer = document.querySelector('.app-scroll-container')

  if (!target || !scrollContainer) {
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
    return
  }

  const containerRect = scrollContainer.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()

  scrollContainer.scrollTo({
    top: Math.max(0, targetRect.top - containerRect.top + scrollContainer.scrollTop),
    behavior: 'smooth',
  })
}

function MealLogger({
  displayPhotoMeals,
  favoriteMeals,
  foodPhotoPreview,
  handleFoodPhotoChange,
  healthSnapshot,
  importSummary,
  initialPanel = 'overview',
  navigationIntent,
  meals,
  nutritionGoals,
  onAnalyzePhotoMeal,
  onCancelClearMealHistory,
  onClearMealHistory,
  onCreateDemoMealDay,
  onExportMealHistory,
  onFavoriteMealsChange,
  onImportMealHistory,
  onMealsChange,
  onNutritionGoalsChange,
  onSelectedMealDateChange,
  onShowClearMealHistory,
  photoAnalysisStatus,
  profile,
  selectedMealDate,
  showClearMealHistoryConfirm,
  userId = 'local-user',
  weights,
  weekSummary,
}) {
  const fileInputRef = useRef(null)
  const [draft, setDraft] = useState(() => getEmptyMeal(selectedMealDate))
  const [editingFavoriteId, setEditingFavoriteId] = useState('')
  const [editingMealId, setEditingMealId] = useState('')
  const [errors, setErrors] = useState({})
  const [favoriteSearch, setFavoriteSearch] = useState('')
  const [filters, setFilters] = useState(defaultFilters)
  const [goalDraft, setGoalDraft] = useState(() => normalizeNutritionGoals(nutritionGoals))
  const [historyRange, setHistoryRange] = useState('today')
  const [goalErrors, setGoalErrors] = useState({})
  const [importStatus, setImportStatus] = useState('')
  const [lastMealEdit, setLastMealEdit] = useState(null)
  const [dietaryPreferences, setDietaryPreferences] = useState(() => readDietaryPreferences())
  const [mealTemplateStatus, setMealTemplateStatus] = useState('')
  const [mealTemplates, setMealTemplates] = useState(() => readMealTemplates())
  const [nutritionViewMode, setNutritionViewMode] = useState('day')
  const [recipes, setRecipes] = useState(() => readRecipes())
  const [weekStart, setWeekStart] = useState(() => getWeekStart(selectedMealDate))

  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (initialPanel === 'recipes') {
        setNutritionViewMode('recipes')
      }

      if (initialPanel === 'plan') {
        setNutritionViewMode('planner')
      }

      if (initialPanel === 'scanner') {
        scrollTargetInAppContainer(document.getElementById('nutrition-scanner-v2'))
      }
    })
  }, [initialPanel])

  useEffect(() => {
    if (navigationIntent?.panel !== 'scanner') return

    window.requestAnimationFrame(() => {
      setNutritionViewMode('day')
      scrollTargetInAppContainer(document.getElementById('nutrition-scanner-v2'))
    })
  }, [navigationIntent])

  const normalizedMeals = useMemo(() => normalizeMeals(meals), [meals])
  const normalizedGoals = useMemo(() => normalizeNutritionGoals(nutritionGoals), [nutritionGoals])
  const nutritionMeals = healthSnapshot?.nutrition?.actualMeals || normalizedMeals
  const dailySummary = useMemo(
    () => summarizeDay(nutritionMeals, selectedMealDate, normalizedGoals),
    [normalizedGoals, nutritionMeals, selectedMealDate],
  )
  const weekAnalysis = useMemo(
    () => summarizeWeek(nutritionMeals, weekStart, normalizedGoals),
    [normalizedGoals, nutritionMeals, weekStart],
  )
  const insights = useMemo(
    () =>
      buildNutritionInsights({
        goals: normalizedGoals,
        meals: nutritionMeals,
        weekStart,
      }),
    [normalizedGoals, nutritionMeals, weekStart],
  )
  const suggestedProteinGoal = useMemo(
    () => calculateSuggestedProteinGoal(profile || {}, { weights: weights || [] }),
    [profile, weights],
  )
  const suggestedCalorieGoal = useMemo(
    () => calculateSuggestedCalorieGoal(profile || {}, { weights: weights || [] }),
    [profile, weights],
  )
  const proteinDistributionPlan = useMemo(
    () => buildProteinDistributionPlan(normalizedGoals.protein, nutritionMeals, { date: selectedMealDate }),
    [normalizedGoals.protein, nutritionMeals, selectedMealDate],
  )
  const visibleMeals = useMemo(
    () => {
      const range = getHistoryRangeBounds(selectedMealDate, historyRange)

      return filterAndSortMeals(normalizedMeals, {
        ...filters,
        from: filters.from || range.from,
        to: filters.to || range.to,
      })
    },
    [filters, historyRange, normalizedMeals, selectedMealDate],
  )
  const mealHistorySummary = useMemo(
    () => summarizeMeals(visibleMeals),
    [visibleMeals],
  )
  const mealQualityReview = useMemo(
    () => buildMealQualityReviewModel(normalizedMeals, { limit: 5, proteinGoal: normalizedGoals.protein }),
    [normalizedGoals.protein, normalizedMeals],
  )
  const visibleFavorites = useMemo(() => {
    const search = favoriteSearch.trim().toLocaleLowerCase('sv-SE')

    return favoriteMeals.filter((favorite) =>
      [favorite.name, favorite.description, favorite.type]
        .join(' ')
        .toLocaleLowerCase('sv-SE')
        .includes(search),
    )
  }, [favoriteMeals, favoriteSearch])

  function resetDraft(date = selectedMealDate) {
    setDraft(getEmptyMeal(date))
    setEditingFavoriteId('')
    setEditingMealId('')
    setErrors({})
  }

  function changeSelectedDate(date) {
    onSelectedMealDateChange(date)
    setDraft((current) => ({ ...current, date }))
  }

  function handleDraftChange(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleNutritionOverrideChange(key, value) {
    setDraft((current) => ({
      ...current,
      nutritionOverride: {
        ...(current.nutritionOverride || {}),
        [key]: value,
      },
    }))
  }

  function handleSubmitMeal(event) {
    event.preventDefault()
    const nextErrors = validateMealDraft(draft)

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    if (editingFavoriteId) {
      const favorite = normalizeFavoriteMeal({
        ...draft,
        favoriteId: editingFavoriteId,
        id: editingFavoriteId,
        updatedAt: new Date().toISOString(),
      })

      onFavoriteMealsChange([
        favorite,
        ...favoriteMeals.filter((entry) => entry.id !== editingFavoriteId),
      ])
      resetDraft(draft.date)
      return
    }

    const existingMeal = normalizedMeals.find((meal) => meal.id === editingMealId)

    if (editingMealId) {
      const result = createUpdatedMealRecord(existingMeal, draft)

      setErrors(result.errors)

      if (!result.meal) {
        return
      }

      setLastMealEdit({
        after: result.meal,
        before: existingMeal,
      })
      onMealsChange([result.meal, ...normalizedMeals.filter((entry) => entry.id !== result.meal.id)])
      changeSelectedDate(result.meal.date)
      resetDraft(result.meal.date)
      return
    }

    const meal = mealDraftToMeal(draft, existingMeal)

    onMealsChange([meal, ...normalizedMeals.filter((entry) => entry.id !== meal.id)])
    changeSelectedDate(meal.date)
    resetDraft(draft.date)
  }

  function editMeal(meal) {
    setEditingFavoriteId('')
    setEditingMealId(meal.id)
    setDraft(createMealEditDraft(meal))
    setErrors({})
    changeSelectedDate(meal.date)
  }

  function resetAutomaticAnalysis() {
    const existingMeal = normalizedMeals.find((meal) => meal.id === editingMealId)

    if (!existingMeal) {
      resetDraft()
      return
    }

    const resetMeal = resetMealNutritionOverride(existingMeal)

    setLastMealEdit({
      after: resetMeal,
      before: existingMeal,
    })
    onMealsChange([resetMeal, ...normalizedMeals.filter((entry) => entry.id !== resetMeal.id)])
    setDraft(createMealEditDraft(resetMeal))
    setErrors({})
  }

  function undoLastMealEdit() {
    if (!lastMealEdit?.before) return

    onMealsChange([
      lastMealEdit.before,
      ...normalizedMeals.filter((entry) => entry.id !== lastMealEdit.before.id),
    ])
    setLastMealEdit(null)
  }

  function changeMealTemplates(nextTemplates) {
    setMealTemplates(writeMealTemplates(nextTemplates))
  }

  function changeRecipes(nextRecipes) {
    setRecipes(writeRecipes(nextRecipes))
  }

  function saveDietaryPreferences(nextPreferences) {
    const saved = writeDietaryPreferences(nextPreferences)

    setDietaryPreferences(saved)
    return saved
  }

  function resetDietaryPreferences() {
    const cleared = clearDietaryPreferences()

    setDietaryPreferences(cleared)
    return cleared
  }

  function saveMealTemplate(meal) {
    const result = createMealTemplateFromMeal(meal, { isFavorite: true })

    if (!result.template) {
      setMealTemplateStatus('Måltiden kunde inte sparas som mall.')
      return
    }

    changeMealTemplates([result.template, ...mealTemplates])
    setMealTemplateStatus(`${result.template.name} sparades som mall.`)
  }

  function createTemplateFromRecipe(templateDraft) {
    const result = createMealTemplate(templateDraft)

    if (!result.template) {
      setMealTemplateStatus('Receptet kunde inte sparas som mall.')
      return
    }

    changeMealTemplates([result.template, ...mealTemplates])
    setMealTemplateStatus(`${result.template.name} sparades som mall.`)
  }

  function copyMeal(meal) {
    const date = window.prompt('Vilket datum ska kopian få? (ÅÅÅÅ-MM-DD)', selectedMealDate)

    if (!date) {
      return
    }

    const time = window.prompt('Vilken tid ska kopian få? (TT:MM)', getCurrentTimeString()) || getCurrentTimeString()
    const copiedMeal = {
      ...meal,
      createdAt: new Date().toISOString(),
      date,
      id: '',
      time,
      updatedAt: new Date().toISOString(),
    }
    const normalized = mealDraftToMeal(copiedMeal)

    onMealsChange([normalized, ...normalizedMeals])
  }

  function deleteMeal(mealId) {
    const shouldDelete = window.confirm('Vill du ta bort den här måltiden?')

    if (shouldDelete) {
      onMealsChange(normalizedMeals.filter((meal) => meal.id !== mealId))
      if (editingMealId === mealId) {
        resetDraft()
      }
    }
  }

  function saveFavorite(meal) {
    const favorite = normalizeFavoriteMeal({
      ...meal,
      favoriteId: '',
      id: `favorite-${Date.now()}`,
    })

    onFavoriteMealsChange([favorite, ...favoriteMeals.filter((item) => item.id !== favorite.id)])
  }

  function addFavoriteAsMeal(favorite) {
    const date = window.prompt('Vilket datum ska favoriten läggas till?', selectedMealDate)

    if (!date) {
      return
    }

    const time = window.prompt('Vilken tid?', getCurrentTimeString()) || getCurrentTimeString()

    onMealsChange([favoriteToMeal(favorite, date, time), ...normalizedMeals])
  }

  function addTemplateFromRecommendation(template) {
    const meal = createMealFromTemplate(template, { date: selectedMealDate })

    if (!meal) return false

    onMealsChange([meal, ...normalizedMeals])
    changeSelectedDate(meal.date)
    return true
  }

  function handleScannerMealSaved(meal) {
    setLastMealEdit({ after: meal, before: null })
    changeSelectedDate(meal.date)
  }

  function editFavorite(favorite) {
    setEditingFavoriteId(favorite.id)
    setEditingMealId('')
    setDraft({ ...favorite, date: selectedMealDate, time: getCurrentTimeString() })
    setErrors({})
  }

  function deleteFavorite(favoriteId) {
    const shouldDelete = window.confirm('Vill du ta bort den här favoriten?')

    if (shouldDelete) {
      onFavoriteMealsChange(favoriteMeals.filter((favorite) => favorite.id !== favoriteId))
    }
  }

  function saveGoals() {
    const result = createUpdatedNutritionGoals(normalizedGoals, goalDraft, { source: 'manual' })
    const nextErrors = result.errors

    setGoalErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    onNutritionGoalsChange(result.goals || {})
  }

  function applySuggestedGoal(field, value) {
    const result = createUpdatedNutritionGoals(normalizedGoals, {
      ...normalizedGoals,
      [field]: value,
      [`${field}GoalSource`]: 'suggested',
    }, { source: 'suggested' })

    setGoalErrors(result.errors)

    if (result.goals) {
      setGoalDraft(result.goals)
      onNutritionGoalsChange(result.goals)
    }
  }

  function clearGoals() {
    const shouldClear = window.confirm('Vill du rensa alla kostmål?')

    if (shouldClear) {
      setGoalDraft({})
      onNutritionGoalsChange({})
    }
  }

  function exportNutrition() {
    downloadJson(
      `viktkollen-kostdata-${new Date().toISOString().slice(0, 10)}.json`,
      exportNutritionData({
        dietaryPreferences,
        favorites: favoriteMeals,
        goals: normalizedGoals,
        mealTemplates,
        meals: normalizedMeals,
        recipes,
      }),
    )
  }

  function mergeById(imported, current) {
    const currentIds = new Set(current.map((item) => item.id))
    return [
      ...imported.filter((item) => !currentIds.has(item.id)),
      ...current,
    ]
  }

  function importNutrition(event) {
    const file = event.target.files?.[0]

    if (!file) {
      setImportStatus('Ingen fil valdes.')
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      try {
        const parsed = parseNutritionImport(JSON.parse(String(reader.result)))

        if (!parsed.ok) {
          setImportStatus(parsed.reason)
          return
        }

        const mode = window.prompt(
          `Importen innehåller ${parsed.summary.mealCount} måltider, ${parsed.summary.favoriteCount} favoriter, ${parsed.summary.mealTemplateCount} mallar, ${parsed.summary.recipeCount} recept och ${parsed.summary.hasGoals ? 'kostmål' : 'inga kostmål'}.\nSkriv "slå ihop" eller "ersätt".`,
          'slå ihop',
        )

        if (!mode) {
          setImportStatus('Import avbröts.')
          return
        }

        if (mode.toLocaleLowerCase('sv-SE').includes('ers')) {
          const shouldReplace = window.confirm('Detta ersätter endast kostdata lokalt. Vill du fortsätta?')

          if (!shouldReplace) {
            setImportStatus('Import avbröts.')
            return
          }

          onMealsChange(parsed.meals)
          onFavoriteMealsChange(parsed.favoriteMeals)
          changeMealTemplates(parsed.mealTemplates)
          changeRecipes(parsed.recipes)
          saveDietaryPreferences(parsed.dietaryPreferences)
        } else {
          const currentIds = new Set(normalizedMeals.map((meal) => meal.id))
          const importedMeals = parsed.meals.map((meal) =>
            currentIds.has(meal.id)
              ? { ...meal, id: `meal-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
              : meal,
          )

          onMealsChange([...importedMeals, ...normalizedMeals])
          onFavoriteMealsChange(mergeById(parsed.favoriteMeals, favoriteMeals))
          changeMealTemplates(mergeById(parsed.mealTemplates, mealTemplates))
          changeRecipes(mergeById(parsed.recipes, recipes))
          saveDietaryPreferences({
            ...dietaryPreferences,
            ...parsed.dietaryPreferences,
          })
        }

        if (parsed.hasGoals) {
          setGoalDraft(parsed.goals)
          onNutritionGoalsChange(parsed.goals)
        }

        setImportStatus('Kostdata importerad.')
      } catch {
        setImportStatus('Importen misslyckades. Kontrollera JSON-filen.')
      } finally {
        event.target.value = ''
      }
    })
    reader.readAsText(file)
  }

  return (
    <article className={`panel meals-panel nutrition-panel is-panel-${initialPanel}`} id="maltider">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Kost, måltider och näring</p>
          <h2>Måltidscenter</h2>
        </div>
      </div>

      <nav className="nutrition-date-nav" aria-label="Datum för kostöversikt">
        <button className="secondary-button" type="button" onClick={() => changeSelectedDate(addDays(selectedMealDate, -1))}>
          Föregående dag
        </button>
        <button className="secondary-button" type="button" onClick={() => changeSelectedDate(getTodayDateString())}>
          Idag
        </button>
        <button className="secondary-button" type="button" onClick={() => changeSelectedDate(addDays(selectedMealDate, 1))}>
          Nästa dag
        </button>
        <label className="field">
          <span>Valt datum</span>
          <input type="date" value={selectedMealDate} onChange={(event) => changeSelectedDate(event.target.value)} />
        </label>
      </nav>

      <div className="segmented-control nutrition-view-toggle" aria-label="Välj kostvy">
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'day'} className={nutritionViewMode === 'day' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('day')}>
          Dag
        </button>
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'week'} className={nutritionViewMode === 'week' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('week')}>
          Vecka
        </button>
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'month'} className={nutritionViewMode === 'month' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('month')}>
          Månad
        </button>
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'planner'} className={nutritionViewMode === 'planner' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('planner')}>
          Planera
        </button>
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'generator'} className={nutritionViewMode === 'generator' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('generator')}>
          AI-plan
        </button>
        <button aria-controls="nutrition-view-panel" aria-pressed={nutritionViewMode === 'recipes'} className={nutritionViewMode === 'recipes' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('recipes')}>
          Recept
        </button>
      </div>

      <section id="nutrition-view-panel" aria-label="Aktiv kostvy">
        <Suspense fallback={<div className="lazy-section-fallback" role="status">Laddar kostvy...</div>}>
          {nutritionViewMode === 'day' ? (
            <NutritionDashboard
              date={selectedMealDate}
              meals={nutritionMeals}
              nutritionGoals={normalizedGoals}
            />
          ) : nutritionViewMode === 'week' ? (
            <WeeklyNutritionDashboard
              date={selectedMealDate}
              meals={nutritionMeals}
              nutritionGoals={normalizedGoals}
              onDateChange={changeSelectedDate}
            />
          ) : nutritionViewMode === 'month' ? (
            <MonthlyNutritionDashboard
              date={selectedMealDate}
              meals={nutritionMeals}
              nutritionGoals={normalizedGoals}
              weights={weights}
              onDateChange={changeSelectedDate}
            />
          ) : nutritionViewMode === 'planner' ? (
            <WeeklyMealPlanner
              dietaryPreferences={dietaryPreferences}
              meals={normalizedMeals}
              nutritionGoals={normalizedGoals}
              recipes={recipes}
              templates={mealTemplates}
              onMealsChange={onMealsChange}
            />
          ) : nutritionViewMode === 'generator' ? (
            <AIMealGenerator
              dietaryPreferences={dietaryPreferences}
              nutritionGoals={normalizedGoals}
              recipes={recipes}
              templates={mealTemplates}
            />
          ) : (
            <RecipeManager
              dietaryPreferences={dietaryPreferences}
              recipes={recipes}
              onRecipesChange={changeRecipes}
              onTemplateCreate={createTemplateFromRecipe}
            />
          )}
        </Suspense>
      </section>

      <NutritionActionPlan
        date={selectedMealDate}
        dietaryPreferences={dietaryPreferences}
        meals={nutritionMeals}
        nutritionGoals={normalizedGoals}
        templates={mealTemplates}
        weights={weights}
        onAddTemplate={addTemplateFromRecommendation}
      />

      <DietaryPreferencesPanel
        dietaryPreferences={dietaryPreferences}
        onClear={resetDietaryPreferences}
        onSave={saveDietaryPreferences}
      />

      <MealReviewPanel
        entries={mealQualityReview.entries}
        onEditMeal={editMeal}
      />

      <MealQuickAdd
        dietaryPreferences={dietaryPreferences}
        meals={normalizedMeals}
        selectedMealDate={selectedMealDate}
        templates={mealTemplates}
        onMealsChange={onMealsChange}
        onTemplatesChange={changeMealTemplates}
      />

      {mealTemplateStatus && (
        <div className="nutrition-edit-status" role="status" aria-live="polite">
          <span>{mealTemplateStatus}</span>
        </div>
      )}

      {lastMealEdit && (
        <div className="nutrition-edit-status" role="status" aria-live="polite">
          <span>Måltiden har uppdaterats.</span>
          <button className="secondary-button" type="button" onClick={undoLastMealEdit}>
            Ångra
          </button>
        </div>
      )}

      <div id="nutrition-meal-editor" className="nutrition-meal-editor-panel">
        {editingMealId ? (
          <MealEditForm
            draft={draft}
            errors={errors}
            onCancel={() => resetDraft()}
            onChange={handleDraftChange}
            onNutritionChange={handleNutritionOverrideChange}
            onResetAutomatic={resetAutomaticAnalysis}
            onSubmit={(event) => {
              event.preventDefault()
              const nextErrors = validateMealEditDraft(draft)

              setErrors(nextErrors)

              if (Object.keys(nextErrors).length === 0) {
                handleSubmitMeal(event)
              }
            }}
          />
        ) : (
          <MealEditor
            draft={draft}
            errors={errors}
            isEditing={Boolean(editingFavoriteId)}
            onCancel={() => resetDraft()}
            onChange={handleDraftChange}
            onReset={() => resetDraft()}
            onSubmit={handleSubmitMeal}
          />
        )}
      </div>

      <div className="nutrition-panel-daily-summary">
        <DailyNutritionSummary summary={dailySummary} />
      </div>

      <div className="nutrition-panel-goals">
        <NutritionGoalsPanel
          draft={goalDraft}
          errors={goalErrors}
          proteinDistributionPlan={proteinDistributionPlan}
          suggestedCalorieGoal={suggestedCalorieGoal}
          suggestedProteinGoal={suggestedProteinGoal}
          onChange={(key, value) => setGoalDraft((current) => ({ ...current, [key]: value }))}
          onClear={clearGoals}
          onCancel={() => setGoalDraft(normalizedGoals)}
          onSave={saveGoals}
          onUseSuggestedCalorieGoal={() => applySuggestedGoal('calories', suggestedCalorieGoal?.suggestedGoal)}
          onUseSuggestedProteinGoal={() => applySuggestedGoal('protein', suggestedProteinGoal?.recommendedGrams)}
        />
      </div>

      <div className="nutrition-panel-weekly-analysis">
        <WeeklyNutritionAnalysis
          week={weekAnalysis}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
        />
      </div>

      <div className="nutrition-panel-insights">
        <NutritionInsights insights={insights} />
      </div>

      <div className="nutrition-panel-favorites">
        <FavoriteMeals
          favorites={visibleFavorites}
          search={favoriteSearch}
          onAddFavorite={addFavoriteAsMeal}
          onDeleteFavorite={deleteFavorite}
          onEditFavorite={editFavorite}
          onSearchChange={setFavoriteSearch}
        />
      </div>

      <div className="nutrition-panel-import-export">
        <NutritionImportExport
          fileInputRef={fileInputRef}
          importStatus={importStatus}
          onExport={exportNutrition}
          onFileChange={importNutrition}
          onOpenImport={() => fileInputRef.current?.click()}
        />
      </div>

      <div id="nutrition-scanner-v2" className="scanner-tool">
        <Suspense fallback={<div className="photo-meal-tool" role="status">Laddar skannern...</div>}>
          <NutritionScannerV2
            analysisDate={selectedMealDate}
            meals={normalizedMeals}
            onMealSaved={handleScannerMealSaved}
            onMealsChange={onMealsChange}
            selectedMealDate={selectedMealDate}
            userId={userId}
          />
        </Suspense>
      </div>

      {import.meta.env.DEV && (
        <details className="legacy-photo-analysis">
          <summary>Äldre fotoanalys</summary>
          <div className="nutrition-panel-photo-analysis">
            <PhotoAnalysis
              displayPhotoMeals={displayPhotoMeals}
              foodPhotoPreview={foodPhotoPreview}
              handleFoodPhotoChange={handleFoodPhotoChange}
              onAnalyzePhotoMeal={onAnalyzePhotoMeal}
              photoAnalysisStatus={photoAnalysisStatus}
            />
          </div>
        </details>
      )}

      <div className="nutrition-panel-weekly-report">
        <MealWeeklyReport weekSummary={weekSummary} />
      </div>

      <div className="nutrition-panel-history-tools">
        <MealHistoryTools
          importSummary={importSummary}
          showClearHistoryConfirm={showClearMealHistoryConfirm}
          onCancelClearHistory={onCancelClearMealHistory}
          onClearHistory={onClearMealHistory}
          onCreateDemoMealDay={onCreateDemoMealDay}
          onExportHistory={onExportMealHistory}
          onImportHistory={onImportMealHistory}
          onShowClearHistory={onShowClearMealHistory}
        />
      </div>

      <div className="nutrition-panel-history">
        <MealHistory
          filters={filters}
          historyRange={historyRange}
          historySummary={mealHistorySummary}
          historyRangeOptions={historyRangeOptions}
          meals={visibleMeals}
          onClearFilters={() => setFilters(defaultFilters)}
          onCopyMeal={copyMeal}
          onDeleteMeal={deleteMeal}
          onEditMeal={editMeal}
          onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onHistoryRangeChange={setHistoryRange}
          onSaveFavorite={saveFavorite}
          onSaveTemplate={saveMealTemplate}
        />
      </div>
    </article>
  )
}

export default MealLogger
