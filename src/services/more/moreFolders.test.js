import { describe, expect, it } from 'vitest'
import { moreHubFolders, resolveMoreFolderFromTarget } from './moreFolders.js'

describe('more hub folders', () => {
  it('keeps accessibility and 65+ as separate More folders', () => {
    expect(moreHubFolders.find((folder) => folder.id === 'accessibility')).toMatchObject({
      title: 'Tillgänglighet & hjälpmedel',
    })
    expect(moreHubFolders.find((folder) => folder.id === 'senior-65-plus')).toMatchObject({
      title: '65+ · Min vardag',
    })
    expect(moreHubFolders.find((folder) => folder.id === 'accessibility')).not.toEqual(
      moreHubFolders.find((folder) => folder.id === 'senior-65-plus'),
    )
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
    expect(resolveMoreFolderFromTarget('accessibility')).toBe('accessibility')
    expect(resolveMoreFolderFromTarget('app-section-accessibility')).toBe('accessibility')
    expect(resolveMoreFolderFromTarget('#quiet-hours')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('nutrition-scanner-v2')).toBe('mat')
    expect(resolveMoreFolderFromTarget('data-export')).toBe('import-export')
    expect(resolveMoreFolderFromTarget('mal-framsteg-oversikt')).toBe('mal-framsteg')
    expect(resolveMoreFolderFromTarget('backup-historik')).toBe('arkiv-historik')
    expect(resolveMoreFolderFromTarget('installningar')).toBe('installningar')
    expect(resolveMoreFolderFromTarget('app-section-more')).toBeNull()
  })
})
