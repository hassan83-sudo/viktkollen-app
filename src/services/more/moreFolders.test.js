import { describe, expect, it } from 'vitest'
import { moreHubFolders, resolveMoreFolderFromTarget } from './moreFolders.js'

describe('more hub folders', () => {
  it('lists Framsteg, Mat and AI Coach first while preserving the family hubs', () => {
    expect(moreHubFolders).toHaveLength(12)
    expect(moreHubFolders.map((folder) => folder.id)).toEqual([
      'mal-framsteg',
      'mat',
      'ai-coach',
      'ma-bra',
      'ekonomi',
      'sign-language',
      'animal-world',
      'pregnancy-first-year',
      'sakerhet-backup',
      'import-export',
      'arkiv-historik',
      'installningar',
    ])
    expect(moreHubFolders.map((folder) => folder.title)).toEqual([
      'Framsteg',
      'Mat',
      'AI Coach',
      'Må bra',
      'Ekonomi',
      'Teckenspråk',
      'Djurvärlden',
      'Graviditet & första året',
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
    expect(resolveMoreFolderFromTarget('app-section-wellbeing')).toBe('ma-bra')
    expect(resolveMoreFolderFromTarget('wellbeing-center')).toBe('ma-bra')
    expect(resolveMoreFolderFromTarget('app-section-economy')).toBe('ekonomi')
    expect(resolveMoreFolderFromTarget('economy-center')).toBe('ekonomi')
    expect(resolveMoreFolderFromTarget('sign-language')).toBe('sign-language')
    expect(resolveMoreFolderFromTarget('app-section-sign-language')).toBe('sign-language')
    expect(resolveMoreFolderFromTarget('animal-world')).toBe('animal-world')
    expect(resolveMoreFolderFromTarget('pregnancy-first-year')).toBe('pregnancy-first-year')
    expect(resolveMoreFolderFromTarget('#quiet-hours')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('nutrition-scanner-v2')).toBe('mat')
    expect(resolveMoreFolderFromTarget('data-export')).toBe('import-export')
    expect(resolveMoreFolderFromTarget('mal-framsteg-oversikt')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('backup-historik')).toBe('arkiv-historik')
    expect(resolveMoreFolderFromTarget('installningar')).toBe('installningar')
    expect(resolveMoreFolderFromTarget('app-section-more')).toBeNull()
  })
})
