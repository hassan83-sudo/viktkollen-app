import { supportedLanguages } from './languages.js'
import { i18nNamespaces, translationResources } from './resources.js'

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function flattenKeys(value, prefix = '') {
  if (!isObject(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    if (isObject(nestedValue)) {
      return flattenKeys(nestedValue, nextPrefix)
    }
    return [nextPrefix]
  })
}

export function checkTranslations() {
  const source = translationResources.sv || {}
  const sourceNamespaceKeys = Object.fromEntries(
    i18nNamespaces.map((namespace) => [
      namespace,
      new Set(flattenKeys(source[namespace] || {})),
    ]),
  )

  const report = {
    extra: {},
    invalidLocales: [],
    missing: {},
    missingNamespaces: {},
  }

  supportedLanguages.forEach((language) => {
    const localeResources = translationResources[language.code]
    if (!localeResources) {
      report.invalidLocales.push(language.code)
      return
    }

    const missingNamespaces = i18nNamespaces.filter((namespace) => !isObject(localeResources[namespace]))
    if (missingNamespaces.length) {
      report.missingNamespaces[language.code] = missingNamespaces
    }

    i18nNamespaces.forEach((namespace) => {
      const sourceKeys = sourceNamespaceKeys[namespace]
      const localeKeys = new Set(flattenKeys(localeResources[namespace] || {}))
      const missing = [...sourceKeys].filter((key) => !localeKeys.has(key))
      const extra = [...localeKeys].filter((key) => !sourceKeys.has(key))

      if (missing.length) {
        report.missing[language.code] ||= {}
        report.missing[language.code][namespace] = missing
      }

      if (extra.length) {
        report.extra[language.code] ||= {}
        report.extra[language.code][namespace] = extra
      }
    })
  })

  return report
}
