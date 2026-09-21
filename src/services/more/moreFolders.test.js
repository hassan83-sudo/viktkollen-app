import { describe, expect, it } from 'vitest'
import { moreHubFolders, resolveMoreFolderFromTarget } from './moreFolders.js'

describe('more hub folders', () => {
  it('lists current More hub folders including activity, 65+, debt and archive', () => {
    expect(moreHubFolders.map((folder) => folder.id)).toEqual([
      'mal-framsteg',
      'mat',
      'aktivitet',
      'ai-coach',
      'ma-bra',
      'senior-65-plus',
      'ekonomi',
      'inkasso',
      'kronofogden',
      'sign-language',
      'animal-world',
      'pregnancy-first-year',
      'sakerhet-backup',
      'import-export',
      'arkiv-historik',
      'installningar',
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
    expect(resolveMoreFolderFromTarget('maltider')).toBe('mat')
    expect(resolveMoreFolderFromTarget('checkin')).toBe('mat')
    expect(resolveMoreFolderFromTarget('nutrition-view-panel')).toBe('mat')
    expect(resolveMoreFolderFromTarget('weekly-meal-planner-title')).toBe('mat')
    expect(resolveMoreFolderFromTarget('recipe-manager-title')).toBe('mat')
    expect(resolveMoreFolderFromTarget('chat')).toBe('ai-coach')
    expect(resolveMoreFolderFromTarget('nutrition-coach-center')).toBe('ai-coach')
    expect(resolveMoreFolderFromTarget('language-settings')).toBe('installningar')
    expect(resolveMoreFolderFromTarget('aktivitet')).toBe('aktivitet')
    expect(resolveMoreFolderFromTarget('senior-65-plus')).toBe('senior-65-plus')
    expect(resolveMoreFolderFromTarget('inkasso')).toBe('inkasso')
    expect(resolveMoreFolderFromTarget('kronofogden')).toBe('kronofogden')
    expect(resolveMoreFolderFromTarget('arkiv-historik')).toBe('arkiv-historik')
    expect(resolveMoreFolderFromTarget('app-section-more')).toBeNull()
  })
})
