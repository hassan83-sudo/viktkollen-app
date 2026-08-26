import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { userDataKeys } from '../services/userDataRepository.js'
import {
  defaultLanguageCode,
  getLanguageDefinition,
  normalizeLanguageCode,
  supportedLanguageCodes,
} from './languages.js'
import { i18nNamespaces, translationResources } from './resources.js'

export const localeStorageKey = 'viktkollen.locale'

function readBrowserProfileLocale() {
  if (typeof window === 'undefined') return ''

  try {
    const rawProfile = window.localStorage?.getItem(userDataKeys.profile)
    if (!rawProfile) return ''
    const parsed = JSON.parse(rawProfile)
    return normalizeLanguageCode(parsed?.locale || '')
  } catch {
    return ''
  }
}

const browserProfileDetector = {
  cacheUserLanguage() {},
  lookup() {
    return readBrowserProfileLocale()
  },
  name: 'browserProfile',
}

const languageDetector = new LanguageDetector()
languageDetector.addDetector(browserProfileDetector)

if (!i18n.isInitialized) {
  i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      debug: import.meta.env.DEV,
      defaultNS: 'common',
      fallbackLng: {
        default: [defaultLanguageCode, 'en'],
      },
      interpolation: {
        escapeValue: false,
      },
      load: 'currentOnly',
      missingKeyHandler(language, namespace, key) {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] Missing key ${namespace}:${key} for ${language}`)
        }
      },
      ns: i18nNamespaces,
      partialBundledLanguages: true,
      react: {
        useSuspense: false,
      },
      resources: translationResources,
      returnEmptyString: false,
      returnNull: false,
      saveMissing: import.meta.env.DEV,
      supportedLngs: supportedLanguageCodes,
    })
}

export function applyDocumentLanguage(languageCode) {
  if (typeof document === 'undefined') return
  const normalized = normalizeLanguageCode(languageCode)
  const language = getLanguageDefinition(normalized)
  document.documentElement.lang = language.code
  document.documentElement.dir = language.direction === 'rtl' ? 'rtl' : 'ltr'
}

export function getActiveLanguageCode() {
  return normalizeLanguageCode(i18n.resolvedLanguage || i18n.language)
}

export function getActiveDirection() {
  return getLanguageDefinition(getActiveLanguageCode()).direction
}

export function changeAppLanguage(languageCode) {
  const normalized = normalizeLanguageCode(languageCode)
  return i18n.changeLanguage(normalized)
}

applyDocumentLanguage(getActiveLanguageCode())
i18n.on('languageChanged', (languageCode) => {
  const normalized = normalizeLanguageCode(languageCode)
  if (typeof window !== 'undefined') {
    window.localStorage?.setItem(localeStorageKey, normalized)
  }
  applyDocumentLanguage(normalized)
})

export default i18n
