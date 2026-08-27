/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import i18n, { applyDocumentLanguage, changeAppLanguage } from './index.js'
import { checkTranslations } from './checkTranslations.js'
import { getLanguageDefinition, normalizeLanguageCode } from './languages.js'

describe('i18n foundation', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await changeAppLanguage('sv')
  })

  it('loads core locales and maps regional variants', async () => {
    expect(normalizeLanguageCode('sv-SE')).toBe('sv')
    expect(normalizeLanguageCode('en-US')).toBe('en')
    expect(normalizeLanguageCode('nb-NO')).toBe('no')
    expect(normalizeLanguageCode('zh-SG')).toBe('zh-CN')
    expect(normalizeLanguageCode('zh-HK')).toBe('zh-TW')
    expect(normalizeLanguageCode('ko-KR')).toBe('ko')
  })

  it('updates document language and direction', async () => {
    await changeAppLanguage('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')

    await changeAppLanguage('sv')
    expect(document.documentElement.lang).toBe('sv')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('keeps translations available for required launch locales', async () => {
    const requiredLocales = ['sv', 'en', 'da', 'no', 'fi', 'ar', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl']

    for (const locale of requiredLocales) {
      await changeAppLanguage(locale)
      expect(i18n.t('navigation:sections.home.label')).toBeTruthy()
    }
  })

  it('supports interpolation and pluralization', async () => {
    await changeAppLanguage('en')
    expect(i18n.t('common:units.days', { count: 1 })).toBe('1 day')
    expect(i18n.t('common:units.days', { count: 3 })).toBe('3 days')
  })

  it('falls back without crashing when a key is missing', async () => {
    await changeAppLanguage('sv')
    expect(i18n.t('common:actions.save')).toBe('Spara')
    expect(i18n.t('common:missing.key', { defaultValue: 'Spara' })).toBe('Spara')
  })

  it('has namespace coverage relative to Swedish source', () => {
    const report = checkTranslations()
    expect(report.invalidLocales).toEqual([])
    expect(report.missingNamespaces).toEqual({})
    expect(report.missing).toEqual({})
    expect(report.extra).toEqual({})
  })

  it('exposes registry metadata for rtl languages', () => {
    applyDocumentLanguage('ar')
    expect(getLanguageDefinition('ar').direction).toBe('rtl')
  })
})
