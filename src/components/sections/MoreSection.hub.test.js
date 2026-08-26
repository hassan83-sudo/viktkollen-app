import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const moreSectionSource = readFileSync(new URL('./MoreSection.jsx', import.meta.url), 'utf8')
const cloudBackupSource = readFileSync(new URL('../CloudBackupPanel.jsx', import.meta.url), 'utf8')
const notificationSource = readFileSync(new URL('../NotificationCenter.jsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const bottomNavSource = readFileSync(new URL('../app/BottomNavigation.jsx', import.meta.url), 'utf8')

describe('More information architecture', () => {
  it('keeps backup under security, notices under notices, import under import, account under settings', () => {
    expect(moreSectionSource).toContain("activeFolder === 'sakerhet-backup'")
    expect(moreSectionSource).toContain('<CloudBackupPanel')
    expect(moreSectionSource).toContain('variant="security"')
    expect(moreSectionSource).toContain("activeFolder === 'notiser'")
    expect(moreSectionSource).toContain('<ReminderSettings')
    expect(moreSectionSource).toContain('<NotificationCenter')
    expect(moreSectionSource).toContain("activeFolder === 'import-export'")
    expect(moreSectionSource).toContain('<DataImportCenter')
    expect(moreSectionSource).toContain('<DataExportCenter')
    expect(moreSectionSource).toContain("activeFolder === 'installningar'")
    expect(moreSectionSource).toContain("t('accountTitle')")
    expect(moreSectionSource).toContain('<MoreGoalsFolder')
    expect(moreSectionSource).not.toContain('<ProgressCenter')
    expect(moreSectionSource).not.toContain('<WeightChart')
  })

  it('returns to the hub with Tillbaka and keeps bottom navigation in the app shell', () => {
    expect(moreSectionSource).toContain('onBack={handleBackToHub}')
    expect(moreSectionSource).toContain('setActiveFolder(null)')
    expect(appSource).toContain('<BottomNavigation')
    expect(bottomNavSource).toContain('className="bottom-nav"')
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
