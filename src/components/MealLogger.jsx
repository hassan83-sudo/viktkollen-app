import { useMemo, useRef, useState } from 'react'
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
import MonthlyNutritionDashboard from './MonthlyNutritionDashboard.jsx'
import NutritionActionPlan from './NutritionActionPlan.jsx'
import MealReviewPanel from './nutritionDataQuality/MealReviewPanel.jsx'
import NutritionDashboard from './NutritionDashboard.jsx'
import PhotoAnalysis from './PhotoAnalysis.jsx'
import WeeklyNutritionDashboard from './WeeklyNutritionDashboard.jsx'
import WeeklyMealPlanner from './WeeklyMealPlanner.jsx'
import {
  createMealEditDraft,
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
  readDietaryPreferences,
  resetMealNutritionOverride,
  writeDietaryPreferences,
  validateMealEditDraft,
  writeMealTemplates,
} from '../services/nutrition/nutritionEngine.js'

const defaultFilters = {
  from: '',
  search: '',
  sort: 'newest',
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

function filterAndSortMeals(meals, filters) {
  const search = filters.search.trim().toLocaleLowerCase('sv-SE')

  return normalizeMeals(meals)
    .filter((meal) => {
      if (filters.type !== 'Alla' && meal.type !== filters.type) {
        return false
      }

      if (filters.from && meal.date < filters.from) {
        return false
      }

      if (filters.to && meal.date > filters.to) {
        return false
      }

      if (!search) {
        return true
      }

      return [meal.name, meal.description, meal.note]
        .join(' ')
        .toLocaleLowerCase('sv-SE')
        .includes(search)
    })
    .sort((first, second) => {
      if (filters.sort === 'oldest') {
        return `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
      }

      if (filters.sort === 'caloriesHigh') {
        return (second.calories || 0) - (first.calories || 0)
      }

      if (filters.sort === 'caloriesLow') {
        return (first.calories || 0) - (second.calories || 0)
      }

      if (filters.sort === 'proteinHigh') {
        return (second.protein || 0) - (first.protein || 0)
      }

      if (filters.sort === 'proteinLow') {
        return (first.protein || 0) - (second.protein || 0)
      }

      return `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`)
    })
}

function MealLogger({
  displayPhotoMeals,
  favoriteMeals,
  foodPhotoPreview,
  handleFoodPhotoChange,
  importSummary,
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
  const [goalErrors, setGoalErrors] = useState({})
  const [importStatus, setImportStatus] = useState('')
  const [lastMealEdit, setLastMealEdit] = useState(null)
  const [dietaryPreferences, setDietaryPreferences] = useState(() => readDietaryPreferences())
  const [mealTemplateStatus, setMealTemplateStatus] = useState('')
  const [mealTemplates, setMealTemplates] = useState(() => readMealTemplates())
  const [nutritionViewMode, setNutritionViewMode] = useState('day')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(selectedMealDate))

  const normalizedMeals = useMemo(() => normalizeMeals(meals), [meals])
  const normalizedGoals = useMemo(() => normalizeNutritionGoals(nutritionGoals), [nutritionGoals])
  const dailySummary = useMemo(
    () => summarizeDay(normalizedMeals, selectedMealDate, normalizedGoals),
    [normalizedGoals, normalizedMeals, selectedMealDate],
  )
  const weekAnalysis = useMemo(
    () => summarizeWeek(normalizedMeals, weekStart, normalizedGoals),
    [normalizedGoals, normalizedMeals, weekStart],
  )
  const insights = useMemo(
    () =>
      buildNutritionInsights({
        goals: normalizedGoals,
        meals: normalizedMeals,
        weekStart,
      }),
    [normalizedGoals, normalizedMeals, weekStart],
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
    () => buildProteinDistributionPlan(normalizedGoals.protein, normalizedMeals, { date: selectedMealDate }),
    [normalizedGoals.protein, normalizedMeals, selectedMealDate],
  )
  const visibleMeals = useMemo(
    () => filterAndSortMeals(normalizedMeals, filters),
    [filters, normalizedMeals],
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
        favorites: favoriteMeals,
        goals: normalizedGoals,
        meals: normalizedMeals,
      }),
    )
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
          `Importen innehåller ${parsed.summary.mealCount} måltider, ${parsed.summary.favoriteCount} favoriter och ${parsed.summary.hasGoals ? 'kostmål' : 'inga kostmål'}.\nSkriv "slå ihop" eller "ersätt".`,
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
        } else {
          const currentIds = new Set(normalizedMeals.map((meal) => meal.id))
          const importedMeals = parsed.meals.map((meal) =>
            currentIds.has(meal.id)
              ? { ...meal, id: `meal-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
              : meal,
          )

          onMealsChange([...importedMeals, ...normalizedMeals])
          onFavoriteMealsChange([...parsed.favoriteMeals, ...favoriteMeals])
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
    <article className="panel meals-panel nutrition-panel" id="maltider">
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
        <button aria-pressed={nutritionViewMode === 'day'} className={nutritionViewMode === 'day' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('day')}>
          Dag
        </button>
        <button aria-pressed={nutritionViewMode === 'week'} className={nutritionViewMode === 'week' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('week')}>
          Vecka
        </button>
        <button aria-pressed={nutritionViewMode === 'month'} className={nutritionViewMode === 'month' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('month')}>
          MÃ¥nad
        </button>
        <button aria-pressed={nutritionViewMode === 'planner'} className={nutritionViewMode === 'planner' ? 'active' : ''} type="button" onClick={() => setNutritionViewMode('planner')}>
          Planera
        </button>
      </div>

      {nutritionViewMode === 'day' ? (
        <NutritionDashboard
          date={selectedMealDate}
          meals={normalizedMeals}
          nutritionGoals={normalizedGoals}
        />
      ) : nutritionViewMode === 'week' ? (
        <WeeklyNutritionDashboard
          date={selectedMealDate}
          meals={normalizedMeals}
          nutritionGoals={normalizedGoals}
          onDateChange={changeSelectedDate}
        />
      ) : nutritionViewMode === 'month' ? (
        <MonthlyNutritionDashboard
          date={selectedMealDate}
          meals={normalizedMeals}
          nutritionGoals={normalizedGoals}
          weights={weights}
          onDateChange={changeSelectedDate}
        />
      ) : (
        <WeeklyMealPlanner
          dietaryPreferences={dietaryPreferences}
          meals={normalizedMeals}
          nutritionGoals={normalizedGoals}
          templates={mealTemplates}
          onMealsChange={onMealsChange}
        />
      )}

      <NutritionActionPlan
        date={selectedMealDate}
        dietaryPreferences={dietaryPreferences}
        meals={normalizedMeals}
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
        <div className="nutrition-edit-status" role="status">
          <span>{mealTemplateStatus}</span>
        </div>
      )}

      {lastMealEdit && (
        <div className="nutrition-edit-status" role="status">
          <span>Måltiden har uppdaterats.</span>
          <button className="secondary-button" type="button" onClick={undoLastMealEdit}>
            Ångra
          </button>
        </div>
      )}

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

      <DailyNutritionSummary summary={dailySummary} />

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

      <WeeklyNutritionAnalysis
        week={weekAnalysis}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
      />

      <NutritionInsights insights={insights} />

      <FavoriteMeals
        favorites={visibleFavorites}
        search={favoriteSearch}
        onAddFavorite={addFavoriteAsMeal}
        onDeleteFavorite={deleteFavorite}
        onEditFavorite={editFavorite}
        onSearchChange={setFavoriteSearch}
      />

      <NutritionImportExport
        fileInputRef={fileInputRef}
        importStatus={importStatus}
        onExport={exportNutrition}
        onFileChange={importNutrition}
        onOpenImport={() => fileInputRef.current?.click()}
      />

      <PhotoAnalysis
        displayPhotoMeals={displayPhotoMeals}
        foodPhotoPreview={foodPhotoPreview}
        handleFoodPhotoChange={handleFoodPhotoChange}
        onAnalyzePhotoMeal={onAnalyzePhotoMeal}
        photoAnalysisStatus={photoAnalysisStatus}
      />

      <MealWeeklyReport weekSummary={weekSummary} />

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

      <MealHistory
        filters={filters}
        meals={visibleMeals}
        onClearFilters={() => setFilters(defaultFilters)}
        onCopyMeal={copyMeal}
        onDeleteMeal={deleteMeal}
        onEditMeal={editMeal}
        onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onSaveFavorite={saveFavorite}
        onSaveTemplate={saveMealTemplate}
      />
    </article>
  )
}

export default MealLogger
