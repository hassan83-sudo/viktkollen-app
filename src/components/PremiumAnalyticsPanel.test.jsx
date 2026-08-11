import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PremiumAnalyticsPanel from './PremiumAnalyticsPanel.jsx'

describe('PremiumAnalyticsPanel', () => {
  it('renders the internal economy dashboard', () => {
    const html = renderToStaticMarkup(<PremiumAnalyticsPanel userId="admin-user" />)

    expect(html).toContain('Premium Analytics')
    expect(html).toContain('Premium ekonomi')
    expect(html).toContain('Uppskattad AI-kostnad')
    expect(html).toContain('API-kostnad per funktion')
    expect(html).toContain('Ekonomisimulator')
    expect(html).toContain('Break-even')
    expect(html).toContain('Verklig vs uppskattad kostnad')
    expect(html).toContain('Endast anonymiserad användaridentifierare')
    expect(html).toContain('AI-text räknas under AI Coach')
    expect(html).toContain('Liten')
    expect(html).toContain('Stor')
  })
})
