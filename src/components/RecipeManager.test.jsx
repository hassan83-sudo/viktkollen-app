import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import RecipeManager from './RecipeManager.jsx'
import WeeklyMealPlanner from './WeeklyMealPlanner.jsx'
import RecipeIngredientEditor from './recipe/RecipeIngredientEditor.jsx'
import RecipeNutritionSummary from './recipe/RecipeNutritionSummary.jsx'

const recipes = [
  {
    category: 'Middag',
    cookingTimeMinutes: 35,
    createdAt: '2026-01-01T10:00:00.000Z',
    description: 'Enkel vardagslåda',
    favorite: true,
    id: 'recipe-chicken',
    ingredients: [
      { amount: 200, name: 'kyckling', unit: 'g' },
      { amount: 300, name: 'potatis', unit: 'g' },
      { amount: 100, name: 'broccoli', unit: 'g' },
    ],
    instructions: 'Tillaga och fördela i lådor.',
    name: 'Kyckling med potatis',
    servings: 2,
    tags: ['proteinrik', 'vardag'],
    updatedAt: '2026-01-02T10:00:00.000Z',
  },
  {
    category: 'Vegetariskt',
    cookingTimeMinutes: 20,
    createdAt: '2026-01-01T10:00:00.000Z',
    description: 'Snabb lunch',
    favorite: false,
    id: 'recipe-egg',
    ingredients: [
      { amount: 2, name: 'ägg', unit: 'st' },
      { amount: 150, name: 'broccoli', unit: 'g' },
    ],
    instructions: 'Koka ägg och servera med grönsaker.',
    name: 'Ägglunch',
    servings: 1,
    tags: ['vegetarisk'],
    updatedAt: '2026-01-03T10:00:00.000Z',
  },
]

function managerHtml(props = {}) {
  return renderToStaticMarkup(
    <RecipeManager
      dietaryPreferences={{ dietType: 'vegetarian' }}
      recipes={recipes}
      onRecipesChange={vi.fn()}
      onTemplateCreate={vi.fn()}
      {...props}
    />,
  )
}

describe('Recipe Manager UI', () => {
  it.each([
    ['manager title', 'Recept'],
    ['storage note', 'separat från måltider och mallar'],
    ['editor heading', 'Skapa recept'],
    ['name field', 'Namn'],
    ['category field', 'Kategori'],
    ['servings field', 'Portioner'],
    ['cooking time field', 'Tillagningstid'],
    ['description field', 'Beskrivning'],
    ['instructions field', 'Instruktioner'],
    ['tags field', 'Taggar'],
    ['ingredient heading', 'Ingredienser'],
    ['add ingredient action', 'Lägg till ingrediens'],
    ['library heading', 'Dina recept'],
    ['search field', 'Sök'],
    ['sort field', 'Sortera'],
    ['favorite filter', 'Favoriter'],
  ])('renders %s', (_, expected) => {
    expect(managerHtml()).toContain(expected)
  })

  it.each([
    ['recipe name', 'Kyckling med potatis'],
    ['recipe description', 'Enkel vardagslåda'],
    ['recipe ingredient', 'kyckling'],
    ['recipe tag', 'proteinrik'],
    ['favorite button', 'Favorit'],
    ['template action', 'Skapa mall'],
    ['duplicate action', 'Duplicera'],
    ['edit action', 'Redigera'],
    ['delete action', 'Ta bort'],
    ['dietary warning', 'filtreras bort'],
  ])('renders card detail %s', (_, expected) => {
    expect(managerHtml()).toContain(expected)
  })

  it('renders empty state', () => {
    expect(managerHtml({ recipes: [] })).toContain('Inga recept ännu.')
  })

  it('does not render unsafe placeholders', () => {
    expect(managerHtml({ recipes: [null] })).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('renders nutrition summary labels', () => {
    const markup = renderToStaticMarkup(<RecipeNutritionSummary recipe={recipes[0]} />)

    expect(markup).toContain('Per portion')
    expect(markup).toContain('Protein')
    expect(markup).toContain('Kolhydrater')
    expect(markup).toContain('Fett')
  })

  it('renders missing nutrition safely', () => {
    expect(renderToStaticMarkup(<RecipeNutritionSummary recipe={null} />)).toContain('Saknas')
  })

  it('renders ingredient rows', () => {
    const markup = renderToStaticMarkup(
      <RecipeIngredientEditor ingredients={recipes[0].ingredients} onChange={vi.fn()} />,
    )

    expect(markup).toContain('Mängd')
    expect(markup).toContain('Enhet')
    expect(markup).toContain('Kommentar')
  })

  it('renders an empty ingredient row when no ingredients exist', () => {
    expect(renderToStaticMarkup(<RecipeIngredientEditor ingredients={[]} onChange={vi.fn()} />)).toContain('Lägg till ingrediens')
  })

  it('keeps accessible pressed state for favorite recipe', () => {
    expect(managerHtml()).toContain('aria-pressed="true"')
  })
})

describe('Weekly Meal Planner recipe UI', () => {
  function plannerHtml(props = {}) {
    return renderToStaticMarkup(
      <WeeklyMealPlanner
        dietaryPreferences={{}}
        meals={[]}
        nutritionGoals={{ protein: 110, calories: 2100 }}
        recipes={recipes}
        templates={[]}
        onMealsChange={vi.fn()}
        {...props}
      />,
    )
  }

  it.each([
    ['recipe section', 'Lägg till från recept'],
    ['recipe search', 'Sök recept'],
    ['recipe result', 'Kyckling med potatis'],
    ['recipe category', 'Middag'],
    ['recipe add action', 'Lägg till'],
  ])('renders %s', (_, expected) => {
    expect(plannerHtml()).toContain(expected)
  })

  it('renders empty recipe result safely', () => {
    expect(plannerHtml({ recipes: [] })).toContain('Inga recept matchar sökningen.')
  })
})
