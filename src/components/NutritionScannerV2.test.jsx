import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import NutritionScannerV2 from './NutritionScannerV2.jsx'

describe('NutritionScannerV2', () => {
  it('renders safe scanner flow and privacy text', () => {
    const markup = renderToStaticMarkup(
      <NutritionScannerV2
        analysisDate="2026-07-31"
        meals={[]}
        onMealsChange={() => {}}
        selectedMealDate="2026-07-31"
      />,
    )

    expect(markup).toContain('Nutrition Scanner V3')
    expect(markup).toContain('Välj bild')
    expect(markup).toContain('Starta analys')
    expect(markup).toContain('Granska och redigera')
    expect(markup).toContain('Ingen måltid sparas')
    expect(markup).toContain('Remote analys skickar bara')
    expect(markup).toContain('Jag godk')
    expect(markup).toContain('Status:')
    expect(markup).toContain('class="photo-input scanner-file-picker"')
    expect(markup).toContain('for="nutrition-scanner-photo-input"')
    expect(markup).toContain('id="nutrition-scanner-photo-input"')
    expect(markup).toContain('accept="image/*"')
    expect(markup).toContain('capture="environment"')
    expect(markup).toContain('class="checkbox-row scanner-consent-row"')
    expect(markup).toContain('for="nutrition-scanner-remote-consent"')
    expect(markup).toContain('id="nutrition-scanner-remote-consent"')
    expect(markup).not.toContain('id="nutrition-scanner-remote-consent" disabled=""')
    expect(markup).toContain('HTTP-LAN')
    expect(markup).not.toMatch(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]|base64|data:image/)
  })
})
