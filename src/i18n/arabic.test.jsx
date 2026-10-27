/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n, { changeAppLanguage } from './index.js'
import { translationResources } from './resources.js'
import { getFeatureFlags } from '../features/featureRegistry.js'
import SmartCameraHub from '../features/smart-camera/components/SmartCameraHub.jsx'
import SmartCameraPrivacyCard from '../features/smart-camera/components/SmartCameraPrivacyCard.jsx'

function leaves(value, path = '') {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`))
  }
  return [[path, value]]
}

afterEach(async () => { await changeAppLanguage('sv') })

describe('Arabic app language', () => {
  it('switches home and navigation to Arabic and applies right-to-left direction', async () => {
    await changeAppLanguage('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(i18n.t('navigation:sections.home.label')).toBe('الرئيسية')
    expect(i18n.t('navigation:sections.journey.label')).toBe('رحلتي')
    expect(i18n.t('home:cardActions.openCamera')).toBe('فتح الكاميرا')
    expect(i18n.t('home:checklists.title')).toBe('قوائم التحقق')
    expect(i18n.t('settings:language.title')).toBe('اللغة')
    expect(i18n.t('settings:confirmDeleteLabel')).toContain(i18n.t('settings:deleteConfirmPhrase'))
    expect(i18n.t('nutrition:consentDisplay.always')).toBe('السؤال في كل مرة')
    expect(i18n.t('aiEar:title')).toBe('أذن الذكاء الاصطناعي')
    await changeAppLanguage('sv')
    expect(document.documentElement.dir).toBe('ltr')
    expect(i18n.t('home:cardActions.openCamera')).toBe('Öppna kameran')
  })

  it('renders meaningful text for all Arabic plural categories', async () => {
    await changeAppLanguage('ar')
    for (const count of [0, 1, 2, 3, 11, 102]) {
      for (const key of ['common:units.days', 'home:mealDaily.mealsRegistered', 'settings:search.resultCount', 'social:room.friends.online', 'progress:summaries.photoCount']) {
        const result = i18n.t(key, { count })
        expect(result, `${key}: ${count}`).toContain(String(count))
        expect(result, `${key}: ${count}`).not.toBe(key.split(':').at(-1))
        expect(result).toMatch(/[\u0600-\u06ff]/)
      }
    }
  })

  it('keeps every source interpolation, array item and resource key intact', () => {
    const source = leaves(translationResources.en)
    const arabic = new Map(leaves(translationResources.ar))
    const variables = (text) => [...String(text).matchAll(/\{\{[^}]+\}\}/g)].map(([value]) => value).sort()
    for (const [key, value] of source) {
      expect(arabic.has(key), key).toBe(true)
      expect(arabic.get(key), key).toBeTruthy()
      expect(variables(arabic.get(key)), key).toEqual(variables(value))
      expect(arabic.get(key), key).not.toContain('⁇')
    }
  })

  it('shows Arabic camera choices and privacy details for the active mode', async () => {
    await changeAppLanguage('ar')
    const hub = renderToStaticMarkup(<SmartCameraHub flags={getFeatureFlags()} onSelectMode={() => {}} />)
    expect(hub).toContain('الكاميرا الذكية')
    expect(hub).toContain('هل نسيت شيئًا؟')
    expect(hub).toContain('الملابس والأناقة')
    expect(hub).toContain('text-align:start')
    const active = renderToStaticMarkup(<SmartCameraPrivacyCard cameraActive aiReceivesFrame />)
    expect(active).toContain('تظهر المعاينة المباشرة على هذا الجهاز فقط.')
    expect(active).toContain('لا تُرسل صورة ثابتة إلى الذكاء الاصطناعي إلا عندما تختار تحليلها صراحةً.')
    const audio = renderToStaticMarkup(<SmartCameraPrivacyCard audioToServer />)
    expect(audio).toContain('لا تُستخدم الكاميرا في هذا الوضع.')
    expect(audio).toContain('لا يُحفظ الصوت على الجهاز أو الخادم.')
  })
})
