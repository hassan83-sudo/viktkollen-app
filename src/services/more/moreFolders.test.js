import { describe, expect, it } from 'vitest'
import { moreHubFolders, resolveMoreFolderFromTarget } from './moreFolders.js'

describe('more hub folders', () => {
  it('lists Framsteg, Mat and AI Coach first', () => {
    expect(moreHubFolders).toHaveLength(7)
    expect(moreHubFolders.map((folder) => folder.id)).toEqual([
      'mal-framsteg',
      'mat',
      'ai-coach',
      'sakerhet-backup',
      'import-export',
      'arkiv-historik',
      'installningar',
    ])
    expect(moreHubFolders.map((folder) => folder.title)).toEqual([
      'Framsteg',
      'Mat',
      'AI Coach',
      'Säkerhet & Backup',
      'Import & Export',
      'Arkiv & Historik',
      'Inställningar',
    ])
  })

  it('resolves deep-link targets to the right folder', () => {
    expect(resolveMoreFolderFromTarget('molnbackup')).toBe('sakerhet-backup')
    expect(resolveMoreFolderFromTarget('ai-coach')).toBe('ai-coach')
    expect(resolveMoreFolderFromTarget('mat')).toBe('mat')
    expect(resolveMoreFolderFromTarget('app-section-nutrition')).toBe('mat')
    expect(resolveMoreFolderFromTarget('app-section-coach')).toBe('ai-coach')
    expect(resolveMoreFolderFromTarget('app-section-progress')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('#quiet-hours')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('nutrition-scanner-v2')).toBe('mat')
    expect(resolveMoreFolderFromTarget('data-export')).toBe('import-export')
    expect(resolveMoreFolderFromTarget('mal-framsteg-oversikt')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('backup-historik')).toBe('arkiv-historik')
    expect(resolveMoreFolderFromTarget('installningar')).toBe('installningar')
    expect(resolveMoreFolderFromTarget('app-section-more')).toBeNull()
  })
})
