import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import GlobalSearch from './GlobalSearch.jsx'

describe('GlobalSearch', () => {
    it('renders an accessible search trigger without mounting the dialog', () => {
    const markup = renderToStaticMarkup(<GlobalSearch onNavigate={() => {}} />)

    expect(markup).toContain('aria-label="Öppna global sökning"')
    expect(markup).toContain('aria-label="Röstsök"')
    expect(markup).toContain('Sök')
    expect(markup).toContain('Ctrl K')
  })
})
