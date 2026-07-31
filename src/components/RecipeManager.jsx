import { useMemo, useState } from 'react'
import {
  createRecipe,
  deleteRecipe,
  duplicateRecipe,
  filterRecipes,
  normalizeRecipe,
  recipeCategories,
  recipeToMealTemplateDraft,
  toggleRecipeFavorite,
  updateRecipe,
} from '../services/nutrition/nutritionEngine.js'
import RecipeEditor from './recipe/RecipeEditor.jsx'
import RecipeList from './recipe/RecipeList.jsx'

function emptyDraft() {
  return {
    category: 'Middag',
    cookingTimeMinutes: 30,
    description: '',
    ingredients: [
      {
        amount: '',
        comment: '',
        name: '',
        unit: 'g',
      },
    ],
    instructions: '',
    name: '',
    servings: 4,
    tags: '',
  }
}

function recipeToDraft(recipe) {
  const normalized = normalizeRecipe(recipe)

  return {
    ...emptyDraft(),
    ...normalized,
    tags: normalized.tags.join(', '),
  }
}

function RecipeManager({
  dietaryPreferences,
  onRecipesChange,
  onTemplateCreate,
  recipes,
}) {
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState('')
  const [errors, setErrors] = useState({})
  const [filters, setFilters] = useState({ category: 'Alla', search: '', sort: 'updated' })
  const [status, setStatus] = useState('')
  const visibleRecipes = useMemo(() => filterRecipes(recipes, filters), [filters, recipes])

  function resetEditor() {
    setDraft(emptyDraft())
    setEditingId('')
    setErrors({})
  }

  function changeDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function submitRecipe(event) {
    event.preventDefault()

    if (editingId) {
      const nextRecipes = updateRecipe(recipes, editingId, draft)
      const updated = nextRecipes.find((recipe) => recipe.id === editingId)

      if (!updated) {
        const result = createRecipe(draft)
        setErrors(result.errors)
        return
      }

      onRecipesChange(nextRecipes)
      setStatus(`${updated.name} sparades.`)
      resetEditor()
      return
    }

    const result = createRecipe(draft)
    setErrors(result.errors)
    if (!result.recipe) return

    onRecipesChange([result.recipe, ...recipes])
    setStatus(`${result.recipe.name} skapades.`)
    resetEditor()
  }

  function editRecipe(recipe) {
    setDraft(recipeToDraft(recipe))
    setEditingId(recipe.id)
    setErrors({})
  }

  function removeRecipe(recipeId) {
    if (!window.confirm('Vill du ta bort receptet?')) return
    onRecipesChange(deleteRecipe(recipes, recipeId))
    setStatus('Receptet togs bort.')
    if (editingId === recipeId) resetEditor()
  }

  function duplicate(recipeId) {
    const nextRecipes = duplicateRecipe(recipes, recipeId)
    onRecipesChange(nextRecipes)
    setStatus('Receptet duplicerades.')
  }

  function toggleFavorite(recipeId) {
    onRecipesChange(toggleRecipeFavorite(recipes, recipeId))
  }

  function createTemplate(recipe) {
    const draftTemplate = recipeToMealTemplateDraft(recipe)
    if (!draftTemplate || !onTemplateCreate) return
    onTemplateCreate(draftTemplate)
    setStatus(`${recipe.name} skickades till måltidsmallar.`)
  }

  return (
    <section className="nutrition-card recipe-manager" aria-labelledby="recipe-manager-title">
      <div className="nutrition-card-heading">
        <div>
          <p className="eyebrow">Receptmotor</p>
          <h3 id="recipe-manager-title">Recept</h3>
          <span>Recept sparas separat från måltider och mallar.</span>
        </div>
      </div>

      {status && <p className="nutrition-edit-status" role="status" aria-live="polite">{status}</p>}

      <div className="recipe-manager-layout">
        <RecipeEditor
          draft={draft}
          errors={errors}
          mode={editingId ? 'edit' : 'new'}
          onCancel={resetEditor}
          onChange={changeDraft}
          onSubmit={submitRecipe}
        />

        <section className="nutrition-card recipe-browser">
          <div className="nutrition-card-heading">
            <div>
              <p className="eyebrow">Bibliotek</p>
              <h4>Dina recept</h4>
            </div>
          </div>
          <div className="meal-template-form-grid">
            <label className="field">
              <span>Sök</span>
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </label>
            <label className="field">
              <span>Kategori</span>
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                <option>Alla</option>
                <option>Favoriter</option>
                {recipeCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Sortera</span>
              <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
                <option value="updated">Senast ändrad</option>
                <option value="name">Namn</option>
                <option value="protein">Mest protein</option>
                <option value="time">Tillagningstid</option>
              </select>
            </label>
          </div>

          <RecipeList
            dietaryPreferences={dietaryPreferences}
            recipes={visibleRecipes}
            onCreateTemplate={createTemplate}
            onDelete={removeRecipe}
            onDuplicate={duplicate}
            onEdit={editRecipe}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      </div>
    </section>
  )
}

export default RecipeManager
