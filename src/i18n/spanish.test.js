/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import i18n, { changeAppLanguage } from './index.js'
import { translationResources } from './resources.js'

function leaves(value, path = '') {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`))
  }
  return [[path, value]]
}

afterEach(async () => { await changeAppLanguage('sv') })

describe('Spanish app language', () => {
  it('switches the mixed-language home controls and navigation to Spanish without reloading', async () => {
    await changeAppLanguage('es')
    expect(document.documentElement.lang).toBe('es')
    expect(document.documentElement.dir).toBe('ltr')
    expect(i18n.t('home:cardActions.openCamera')).toBe('Abrir cámara')
    expect(i18n.t('home:chooseImage')).toBe('Elegir imagen')
    expect(i18n.t('home:checklists.description')).toBe('Crea y abre tus listas')
    expect(i18n.t('home:mood.wellbeingQuestion')).toBe('¿Cómo te sientes hoy?')
    expect(i18n.t('home:quickShortcuts.alarm')).toBe('Despertador')
    expect(i18n.t('navigation:sections.journey.label')).toBe('Mi camino')
    expect(i18n.t('navigation:sections.social.label')).toBe('Encuentro')
    expect(i18n.t('settings:language.title')).toBe('Idioma')
    expect(i18n.t('aiEar:title')).toBe('Oído de IA')
    expect(i18n.t('common:units.days', { count: 1 })).toBe('1 día')
    expect(i18n.t('common:units.days', { count: 3 })).toBe('3 días')
    await changeAppLanguage('sv')
    expect(i18n.t('home:checklists.title')).toBe('Checklistor')
    expect(i18n.t('navigation:sections.journey.label')).toBe('Min resa')
  })

  it('preserves every source variable, array entry and resource key', () => {
    const source = leaves(translationResources.en)
    const spanish = new Map(leaves(translationResources.es))
    expect([...spanish.keys()].sort()).toEqual(source.map(([key]) => key).sort())
    const variables = (text) => [...String(text).matchAll(/\{\{[^}]+\}\}/g)].map(([value]) => value).sort()
    for (const [key, value] of source) {
      expect(spanish.get(key), key).toBeTruthy()
      expect(variables(spanish.get(key)), key).toEqual(variables(value))
    }
  })
})
