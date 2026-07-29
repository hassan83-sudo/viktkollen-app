import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DietaryPreferencesPanel from './nutrition/DietaryPreferencesPanel.jsx'

function html(props = {}) {
  return renderToStaticMarkup(
    <DietaryPreferencesPanel
      dietaryPreferences={{}}
      onClear={vi.fn()}
      onSave={vi.fn((value) => value)}
      {...props}
    />,
  )
}

describe('Dietary Preferences Panel', () => {
  it('renders empty preference summary', () => {
    expect(html()).toContain('Inga särskilda matval är angivna.')
  })

  it('renders diet type fieldset and legend', () => {
    const markup = html()

    expect(markup).toContain('<fieldset')
    expect(markup).toContain('<legend>Kosttyp</legend>')
  })

  it('renders diet type options without enum text', () => {
    const markup = html()

    expect(markup).toContain('Allätare')
    expect(markup).toContain('Vegetariskt')
    expect(markup).not.toContain('omnivore')
  })

  it('renders checkbox labels', () => {
    const markup = html()

    expect(markup).toContain('Laktosfritt')
    expect(markup).toContain('Glutenfritt')
    expect(markup).toContain('Halal prioriteras')
  })

  it('renders food tag inputs', () => {
    const markup = html()

    expect(markup).toContain('Vill undvika')
    expect(markup).toContain('Föredrar')
    expect(markup).toContain('Skriv matvara och tryck Enter')
  })

  it('renders saved avoided and preferred food tags', () => {
    const markup = html({
      dietaryPreferences: {
        avoidedFoods: ['jordnötter'],
        preferredFoods: ['tofu'],
      },
    })

    expect(markup).toContain('jordnötter')
    expect(markup).toContain('tofu')
  })

  it('renders remove buttons with aria labels', () => {
    expect(html({ dietaryPreferences: { avoidedFoods: ['mjölk'] } })).toContain('aria-label="Ta bort mjölk"')
  })

  it('renders medical caution without saying allergy by default', () => {
    const markup = html()

    expect(markup).toContain('Funktionen ersätter inte medicinsk rådgivning')
    expect(markup.toLocaleLowerCase('sv-SE')).not.toContain('allergi')
  })

  it('renders halal certification caution only when halal is selected', () => {
    expect(html()).not.toContain('certifierad')
    expect(html({ dietaryPreferences: { preferences: { halalPreferred: true } } })).toContain('certifierad')
  })

  it('renders save cancel and reset actions', () => {
    const markup = html()

    expect(markup).toContain('Spara')
    expect(markup).toContain('Avbryt')
    expect(markup).toContain('Rensa')
  })

  it('does not render unsafe placeholders', () => {
    expect(html({ dietaryPreferences: { avoidedFoods: [null], preferredFoods: [undefined] } })).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})
