import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AppSection from './AppSection.jsx'

describe('AppSection', () => {
  it('renders the active section visibly', () => {
    const markup = renderToStaticMarkup(
      <AppSection activeSection="home" id="home" label="Hem">
        <p>Översikt</p>
      </AppSection>,
    )

    expect(markup).toContain('id="app-section-home"')
    expect(markup).toContain('class="app-section is-active"')
    expect(markup).toContain('aria-hidden="false"')
    expect(markup).not.toContain(' hidden=""')
    expect(markup).toContain('Översikt')
  })

  it('hides inactive sections accessibly', () => {
    const markup = renderToStaticMarkup(
      <AppSection activeSection="home" id="coach" label="Coach">
        <p>AI Coach</p>
      </AppSection>,
    )

    expect(markup).toContain('id="app-section-coach"')
    expect(markup).toContain('class="app-section"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('hidden=""')
  })

  it('uses the supplied accessible label', () => {
    const markup = renderToStaticMarkup(
      <AppSection activeSection="nutrition" id="nutrition" label="Mat och nutrition">
        <p>Måltider</p>
      </AppSection>,
    )

    expect(markup).toContain('aria-label="Mat och nutrition"')
  })
})
