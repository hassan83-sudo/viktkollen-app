import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const moreSectionSource = readFileSync(new URL('./components/sections/MoreSection.jsx', import.meta.url), 'utf8')
const overviewDashboardSource = readFileSync(new URL('./components/app/OverviewDashboard.jsx', import.meta.url), 'utf8')
const pwaExperienceSource = readFileSync(new URL('./components/PwaExperience.jsx', import.meta.url), 'utf8')

describe('app section routing isolation', () => {
  it('mounts HomeSection only when home is the active app section', () => {
    expect(appSource).toContain("activeAppSection === 'home'")
    expect(appSource).toMatch(/activeAppSection === 'home'[\s\S]*<HomeSection/)
    expect(appSource).toContain("activeAppSection !== 'home'")
    expect(appSource).toMatch(/activeAppSection !== 'home'[\s\S]*className="content-grid"/)
  })

  it('does not keep progress or more panels in the home render path', () => {
    const homeRenderBlock = appSource
      .split("{activeAppSection === 'home' && (")[1]
      .split("{activeAppSection !== 'home' && (")[0]

    expect(appSource).toMatch(/activeAppSection === 'progress'[\s\S]*<ProgressCenter/)
    expect(appSource).toMatch(/activeAppSection === 'progress'[\s\S]*<ProgressSection/)
    expect(appSource).toMatch(/activeAppSection === 'more'[\s\S]*<MoreSection/)
    expect(homeRenderBlock).toContain('<HomeSection')
    expect(homeRenderBlock).not.toContain('<ProgressSection')
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
})

describe('home dashboard collapsed content', () => {
  it('renders more-for-today child content only after a row is opened', () => {
    expect(overviewDashboardSource).toContain('const [isOpen, setIsOpen] = useState(false)')
    expect(overviewDashboardSource).toContain('onToggle={(event) => setIsOpen(event.currentTarget.open)}')
    expect(overviewDashboardSource).toContain('{isOpen && (')
  })
})
