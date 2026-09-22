import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const moreSectionSource = readFileSync(new URL('./MoreSection.jsx', import.meta.url), 'utf8')
const cloudBackupSource = readFileSync(new URL('../CloudBackupPanel.jsx', import.meta.url), 'utf8')
const notificationSource = readFileSync(new URL('../NotificationCenter.jsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const bottomNavSource = readFileSync(new URL('../app/BottomNavigation.jsx', import.meta.url), 'utf8')

describe('More information architecture', () => {
  it('keeps backup under security, progress under More, import under import, account under settings', () => {
    expect(moreSectionSource).toContain("activeFolder === 'sakerhet-backup'")
    expect(moreSectionSource).toContain('<CloudBackupPanel')
    expect(moreSectionSource).toContain('variant="security"')
    expect(moreSectionSource).toContain("activeFolder === 'mal-framsteg'")
    expect(moreSectionSource).toContain('<ProgressSectionComponent')
    expect(moreSectionSource).toContain("activeFolder === 'import-export'")
    expect(moreSectionSource).toContain('<DataImportCenter')
    expect(moreSectionSource).toContain('<DataExportCenter')
    expect(moreSectionSource).toContain("activeFolder === 'installningar'")
    expect(moreSectionSource).toContain("t('accountTitle')")
    expect(moreSectionSource).not.toContain('<MoreGoalsFolder')
    expect(moreSectionSource).not.toContain('<WeightChart')
  })

  it('bridges the real top-level "more" section into the "progress" section ProgressSection expects', () => {
    // ProgressSection's own internal AppSection/useEffect checks compare
    // against activeSection === 'progress'. The real top-level app section
    // when reached via Mer is 'more', so MoreSection must translate that
    // for its nested ProgressSectionComponent instance.
    expect(moreSectionSource).toMatch(/<ProgressSectionComponent[\s\S]{0,120}activeSection="progress"/)
  })

  it('returns to the hub with Tillbaka and keeps bottom navigation in the app shell', () => {
    expect(moreSectionSource).toContain('onBack={handleBackToHub}')
    expect(moreSectionSource).toContain('setActiveFolder(null)')
    expect(appSource).toContain('<BottomNavigation')
    expect(bottomNavSource).toContain('className="bottom-nav"')
  })

  it('keeps accessibility as its own More route without replacing 65+', () => {
    expect(moreSectionSource).toContain("activeFolder === 'accessibility'")
    expect(moreSectionSource).toContain('<AccessibilityHub')
    expect(moreSectionSource).not.toContain('SeniorEverydaySection')
    expect(appCss).toContain('.accessibility-hub')
  })

  it('wires the existing AI Örat opener from App through MoreSection into AccessibilityHub (A11Y-5H1)', () => {
    // App.jsx supplies onOpenEar the same way it already supplies onOpenEye:
    // a one-shot Home navigation intent that opens the existing Smart kamera
    // AI Örat mode - reusing the real flow, not a second implementation.
    expect(appSource).toContain("onOpenEar={isFeatureEnabled('smartCamera', featureFlags) ? () => {")
    expect(appSource).toContain("mode: 'ai-ear' })")
    expect(appSource.indexOf('<MoreSection')).toBeLessThan(appSource.indexOf("onOpenEar={isFeatureEnabled('smartCamera', featureFlags)"))
    // MoreSection forwards both handlers into AccessibilityHub unchanged.
    expect(moreSectionSource).toContain('onOpenEar,')
    expect(moreSectionSource).toContain('<AccessibilityHub onOpenEar={onOpenEar} onOpenEye={onOpenEye} />')
  })

  it('keeps backup cards compact and IDs in the detail view', () => {
    expect(cloudBackupSource).toContain('backup-history-item is-compact')
    expect(cloudBackupSource).toContain('ID: {backup.id}')
    expect(cloudBackupSource).toContain('expandedBackupId === backup.id')
    expect(appCss).toContain('.backup-history-item.is-compact')
    expect(appCss).toContain('grid-template-columns: auto minmax(0, 1fr) auto')
  })

  it('keeps quiet-hours label on one flex row without letter wrapping', () => {
    expect(notificationSource).toContain('Aktivera tysta timmar')
    expect(notificationSource).toContain('quiet-hours-toggle')
    expect(appCss).toContain('flex-wrap: nowrap')
    expect(appCss).toContain('overflow-wrap: normal !important')
    expect(appCss).toContain('word-break: normal !important')
    expect(appCss).toContain('min-width: 8rem')
  })
})
