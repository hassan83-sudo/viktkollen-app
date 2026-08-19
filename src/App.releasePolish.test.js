import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const homeSectionSource = readFileSync(new URL('./components/sections/HomeSection.jsx', import.meta.url), 'utf8')
const moreSectionSource = readFileSync(new URL('./components/sections/MoreSection.jsx', import.meta.url), 'utf8')
const cloudSyncPanelSource = readFileSync(new URL('./components/CloudSyncPanel.jsx', import.meta.url), 'utf8')
const dataExportSource = readFileSync(new URL('./components/DataExportCenter.jsx', import.meta.url), 'utf8')
const dataImportSource = readFileSync(new URL('./components/DataImportCenter.jsx', import.meta.url), 'utf8')
const progressCenterSource = readFileSync(new URL('./components/ProgressCenter.jsx', import.meta.url), 'utf8')

describe('Release polish shell gating', () => {
  it('does not render the legacy home overview topbar before the new OverviewDashboard', () => {
    expect(appSource).not.toContain('<AppTopbar')
    expect(appSource).toContain('<HomeSection')
  })

  it('keeps the normal Home section limited to the new OverviewDashboard', () => {
    expect(homeSectionSource).toContain('<OverviewDashboard')
    expect(homeSectionSource).not.toContain('HealthDashboardV2')
    expect(homeSectionSource).not.toContain('Hälsodashboard')
    expect(homeSectionSource).not.toContain('DataExportCenter')
    expect(homeSectionSource).not.toContain('DataImportCenter')
    expect(homeSectionSource).not.toContain('CloudSyncPanel')
  })

  it('keeps profile, search and logout reachable from More', () => {
    expect(moreSectionSource).toContain('<GlobalSearch')
    expect(moreSectionSource).toContain('Ändra profil')
    expect(moreSectionSource).toContain('Logga ut')
    expect(moreSectionSource).toContain('Radera konto och data')
    expect(moreSectionSource).toContain("requestAccountDeletion({ mode: 'account' })")
  })

  it('requires an explicit internal tools flag for dev/admin panels', () => {
    expect(appSource).toContain('function isInternalToolsEnabled()')
    expect(appSource).toContain("params.get('internalTools') === '1'")
    expect(appSource).toContain("{showInternalTools && (")
    expect(appSource).not.toContain('{import.meta.env.DEV && (')
  })

  it('does not add destructive cleanup for legacy check-in storage', () => {
    expect(appSource).not.toMatch(/removeItem\(['"]viktkollen\.checkIn/)
    expect(appSource).not.toMatch(/saveCheckIn\(initialCheckIn\)/)
  })
})

describe('Release polish user-facing headings', () => {
  it('removes version suffixes from changed user headings', () => {
    const combined = [
      cloudSyncPanelSource,
      dataExportSource,
      dataImportSource,
      progressCenterSource,
    ].join('\n')

    expect(combined).toContain('Molnsynk')
    expect(combined).toContain('Export och dataportabilitet')
    expect(combined).toContain('Import och återställning')
    expect(combined).toContain('Vikt, kroppsmått och framsteg')
    expect(combined).toContain('Målcenter')
    expect(combined).toContain('Viktgraf')
    expect(combined).not.toMatch(/Cloud Sync V2\/V3|Export och dataportabilitet V2|Import och migration V2|Viktgraf V3|Målcenter V3|Vikt, kroppsmått och framsteg V3/)
  })
})
