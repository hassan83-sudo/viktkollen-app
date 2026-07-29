import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AIMealGenerator from './AIMealGenerator.jsx'

const recipes = [
  {
    category: 'Frukost',
    favorite: true,
    id: 'recipe-breakfast',
    ingredients: ['2 ägg', '40 g havregryn'],
    name: 'Äggfrukost',
    servings: 1,
  },
  {
    category: 'Lunch',
    favorite: true,
    id: 'recipe-lunch',
    ingredients: ['200 g kyckling', '150 g ris'],
    name: 'Kycklinglunch',
    servings: 1,
  },
  {
    category: 'Middag',
    favorite: true,
    id: 'recipe-dinner',
    ingredients: ['180 g lax', '250 g potatis'],
    name: 'Laxmiddag',
    servings: 1,
  },
  {
    category: 'Mellanmål',
    id: 'recipe-snack',
    ingredients: ['200 g kvarg', '1 banan'],
    name: 'Kvargmål',
    servings: 1,
  },
]

const templates = [
  {
    id: 'template-breakfast',
    mealType: 'Frukost',
    name: 'Mallfrukost',
    nutritionOverride: { calories: 350, protein: 25 },
    text: 'kvarg och havregryn',
  },
]

function html(props = {}) {
  return renderToStaticMarkup(
    <AIMealGenerator
      dietaryPreferences={{}}
      nutritionGoals={{ calories: 2100, protein: 130 }}
      recipes={recipes}
      templates={templates}
      {...props}
    />,
  )
}

describe('AI Meal Generator UI', () => {
  it.each([
    ['panel eyebrow', 'AI Meal Generator'],
    ['title', 'Automatisk meny'],
    ['local deterministic copy', 'Deterministisk lokal planering'],
    ['generate day button', 'Generera dag'],
    ['generate week button', 'Generera vecka'],
    ['planner button', 'Skicka till Meal Planner'],
    ['shopping button', 'Skapa Shopping List'],
    ['empty preview', 'Ingen förhandsgranskning ännu.'],
    ['empty preview helper', 'Generera en dag eller vecka'],
    ['accessible label', 'ai-meal-generator-title'],
  ])('renders %s', (_, expected) => {
    expect(html()).toContain(expected)
  })

  it('does not render unsafe placeholders on empty initial state', () => {
    expect(html()).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })

  it('renders safely without recipes', () => {
    expect(html({ recipes: [] })).toContain('Automatisk meny')
  })

  it('renders safely without templates', () => {
    expect(html({ templates: [] })).toContain('Automatisk meny')
  })

  it('renders safely without goals', () => {
    expect(html({ nutritionGoals: {} })).toContain('Automatisk meny')
  })

  it('renders safely with dietary preferences', () => {
    expect(html({ dietaryPreferences: { dietType: 'vegetarian' } })).toContain('Automatisk meny')
  })
})
