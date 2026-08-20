import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getNutritionAnalysisBlocker } from '../services/nutritionScannerFlow.js'
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

  it('allows selected image local analysis clicks without consent or remote provider', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: {}, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toBe('')
  })

  it('allows selected image remote analysis clicks when consent and network are ready', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: {}, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: true,
    })).toBe('')
  })

  it('surfaces missing consent instead of leaving remote click silent', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: {}, imageMetadata: {} },
      isAnalyzing: false,
      isOnline: true,
      providerType: 'remote',
      remoteConsent: false,
    })).toContain('Bekräfta först')
  })

  it('surfaces missing image and in-flight analysis blockers', () => {
    expect(getNutritionAnalysisBlocker({
      imagePayload: null,
      isAnalyzing: false,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toContain('Välj eller ta en bild')

    expect(getNutritionAnalysisBlocker({
      imagePayload: { processedBlob: {}, imageMetadata: {} },
      isAnalyzing: true,
      isOnline: true,
      providerType: 'local',
      remoteConsent: false,
    })).toContain('körs redan')
  })

  it('keeps local analysis independent from the remote provider chunk', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain("onTouchEnd={(event) => handleAnalysisAction('local', event)}")
    expect(source).toContain('handleAnalysisAction')
    expect(source).toContain('createLocalNutritionPhotoEstimate')
    expect(source).toContain("providerType: 'local'")
    expect(source).toContain('scheduleResultScroll')
    expect(source).toContain('scrollIntoView')
    expect(source).toContain("analysis.provider.type === 'local' ? 'Lokal uppskattning att granska' : 'AI-analys att granska'")
    expect(source).toContain('Identifierade komponenter')
    expect(source).toContain('nutrition-component-list')
    expect(source).toContain('componentPortionLabel')
  })

  it('keeps remote consent as a click-time validation rather than a dead disabled button', () => {
    const source = readFileSync(new URL('./NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(source).toContain('getNutritionAnalysisBlocker')
    expect(source).toContain("onTouchEnd={(event) => handleAnalysisAction('remote', event)}")
    expect(source).toContain('disabled={!imagePayload || isAnalyzing || !isOnline}')
  })

  it('renders persistent remote consent management text', () => {
    const markup = renderToStaticMarkup(
      <NutritionScannerV2
        analysisDate="2026-07-31"
        meals={[]}
        onMealsChange={() => {}}
        selectedMealDate="2026-07-31"
        userId="user-a"
      />,
    )

    expect(markup).toContain('Jag godk')
    expect(markup).toContain('nutrition-scanner-remote-consent')
  })

  it('keeps scanner touch targets and consent text mobile-safe in CSS', () => {
    const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.scanner-file-picker,\s*\.body-scan-file-picker\s*\{[\s\S]*overflow:\s*hidden;/)
    expect(css).toMatch(/\.scanner-file-picker input\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*3;/)
    expect(css).toMatch(/\.scanner-file-picker-input\s*\{[\s\S]*position:\s*absolute;[\s\S]*z-index:\s*3;/)
    expect(css).toMatch(/\.scanner-actions\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*2;/)
    expect(css).toMatch(/\.scanner-consent-row\s*\{[\s\S]*grid-template-columns:\s*30px minmax\(10rem, 1fr\);/)
    expect(css).toMatch(/\.scanner-consent-row span\s*\{[\s\S]*white-space:\s*normal;[\s\S]*word-break:\s*normal;[\s\S]*writing-mode:\s*horizontal-tb;/)
    expect(css).toMatch(/\.nutrition-component-list li\s*\{[\s\S]*overflow-wrap:\s*break-word;/)
  })
})
