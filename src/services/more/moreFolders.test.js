import { describe, expect, it } from 'vitest'
import { moreHubFolders, resolveMoreFolderFromTarget } from './moreFolders.js'

describe('more hub folders', () => {
  it('exposes six compact category folders', () => {
    expect(moreHubFolders).toHaveLength(6)
    expect(moreHubFolders.map((folder) => folder.id)).toEqual([
      'sakerhet-backup',
      'notiser',
      'import-export',
      'mal-framsteg',
      'arkiv-historik',
      'installningar',
    ])
    expect(moreHubFolders.map((folder) => folder.title)).toEqual([
      'Säkerhet & Backup',
      'Notiser & Påminnelser',
      'Import & Export',
      'Mål & Framsteg',
      'Arkiv & Historik',
      'Inställningar',
    ])
  })

  it('resolves deep-link targets to the right folder', () => {
    expect(resolveMoreFolderFromTarget('molnbackup')).toBe('sakerhet-backup')
    expect(resolveMoreFolderFromTarget('#quiet-hours')).toBe('notiser')
    expect(resolveMoreFolderFromTarget('data-export')).toBe('import-export')
    expect(resolveMoreFolderFromTarget('mal-framsteg-oversikt')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('backup-historik')).toBe('arkiv-historik')
    expect(resolveMoreFolderFromTarget('installningar')).toBe('installningar')
    expect(resolveMoreFolderFromTarget('app-section-more')).toBeNull()
  })
})
