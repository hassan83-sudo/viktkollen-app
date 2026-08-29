import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const moreSectionSource = readFileSync(new URL('./components/sections/MoreSection.jsx', import.meta.url), 'utf8')
const nutritionSectionSource = readFileSync(new URL('./components/sections/NutritionSection.jsx', import.meta.url), 'utf8')
const overviewDashboardSource = readFileSync(new URL('./components/app/OverviewDashboard.jsx', import.meta.url), 'utf8')
const pwaExperienceSource = readFileSync(new URL('./components/PwaExperience.jsx', import.meta.url), 'utf8')
const navigationOriginDiagnosticsSource = readFileSync(new URL('./services/navigation/navigationOriginDiagnostics.js', import.meta.url), 'utf8')

describe('app section routing isolation', () => {
  it('mounts HomeSection only when home is the active app section', () => {
    expect(appSource).toContain("activeAppSection === 'home'")
    expect(appSource).toMatch(/activeAppSection === 'home'[\s\S]*<HomeSection/)
    expect(appSource).toContain("activeAppSection !== 'home'")
    expect(appSource).toMatch(/activeAppSection !== 'home'[\s\S]*className="content-grid"/)
  })

  it('keeps Notis and More panels outside the home render path and moves Progress under More', () => {
    const homeRenderBlock = appSource
      .split("{activeAppSection === 'home' && (")[1]
      .split("{activeAppSection !== 'home' && (")[0]

    expect(appSource).toMatch(/activeAppSection === 'notices'[\s\S]*<NoticesSection/)
    expect(appSource).toMatch(/activeAppSection === 'more'[\s\S]*<MoreSection/)
    expect(appSource).toContain('ProgressSectionComponent={ProgressSection}')
    expect(appSource).toContain('NutritionSectionComponent={NutritionSection}')
    expect(appSource).toContain("sectionId === 'progress' || sectionId === 'nutrition' || sectionId === 'coach'")
    expect(moreSectionSource).toContain("activeFolder === 'mat'")
    expect(homeRenderBlock).toContain('<HomeSection')
    expect(homeRenderBlock).not.toContain('<NoticesSection')
    expect(homeRenderBlock).not.toContain('<MoreSection')
    expect(homeRenderBlock).not.toContain('Molnstatus')
    expect(homeRenderBlock).not.toContain('Framstegscenter')
  })

  it('keeps cloud, sync, export and import reachable from MoreSection', () => {
    expect(appSource).not.toContain('<CloudStatusPanel')
    expect(appSource).not.toContain('<CloudSyncPanel')
    expect(appSource).not.toContain('<DataExportCenter')
    expect(appSource).not.toContain('<DataImportCenter')
    expect(moreSectionSource).toContain('<CloudStatusPanel')
    expect(moreSectionSource).toContain('<CloudSyncPanel')
    expect(moreSectionSource).toContain('<DataExportCenter')
    expect(moreSectionSource).toContain('<DataImportCenter')
  })

  it('gates PWA diagnostics behind the internal tools flag', () => {
    expect(appSource).toContain('<PwaExperience showDiagnostics={showInternalTools} />')
    expect(pwaExperienceSource).toContain('showDiagnostics = false')
    expect(pwaExperienceSource).toContain('!showDiagnostics')
    expect(pwaExperienceSource).toContain('PWA diagnostics')
  })

  it('keeps internal navigation same-origin and logs dev-only origin diagnostics', () => {
    const combinedSource = [
      appSource,
      nutritionSectionSource,
      overviewDashboardSource,
      navigationOriginDiagnosticsSource,
    ].join('\n')

    expect(combinedSource).not.toContain('viktkollen-app.vercel.app')
    expect(appSource).toContain("handleDailyCoachAction('nutrition', 'nutrition-scanner-v2')")
    expect(nutritionSectionSource).toContain("showPanel('scanner', 'nutrition-scanner-v2')")
    expect(navigationOriginDiagnosticsSource).toContain('!import.meta.env.DEV')
    expect(navigationOriginDiagnosticsSource).toContain('Navigation origin diagnostic')
    expect(navigationOriginDiagnosticsSource).toContain('__viktkollenNavigationDiagnostics')
    expect(navigationOriginDiagnosticsSource).not.toContain('location.href =')
    expect(navigationOriginDiagnosticsSource).not.toContain('location.assign')
    expect(navigationOriginDiagnosticsSource).not.toContain('location.replace')
  })
})

describe('moreIntent is a one-shot signal', () => {
  it('clears moreIntent after MoreSection consumes it, so a plain tap on Mer does not reopen a stale folder', () => {
    expect(appSource).toContain('onNavigationIntentConsumed={() => setMoreIntent(null)}')
    const consumeEffectBody = moreSectionSource
      .split("if (activeSection !== 'more') return")[1]
      .split('}, [activeSection, navigationIntent, onNavigationIntentConsumed])')[0]
    expect(consumeEffectBody.indexOf('setActiveFolder(folder)'))
      .toBeLessThan(consumeEffectBody.indexOf('onNavigationIntentConsumed?.()'))
  })
})

describe('home dashboard collapsed content', () => {
  it('keeps more-for-today rows collapsible while rendering open content', () => {
    expect(overviewDashboardSource).toContain('const [isOpen, setIsOpen] = useState(true)')
    expect(overviewDashboardSource).toContain('onToggle={(event) => setIsOpen(event.currentTarget.open)}')
    expect(overviewDashboardSource).toContain('{isOpen && (')
  })
})
