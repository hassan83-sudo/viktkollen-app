import { checkTranslations } from '../src/i18n/checkTranslations.js'

const report = checkTranslations()
const hasIssues =
  report.invalidLocales.length > 0 ||
  Object.keys(report.missingNamespaces).length > 0 ||
  Object.keys(report.missing).length > 0 ||
  Object.keys(report.extra).length > 0

function countEntries(group = {}) {
  return Object.values(group).reduce((sum, entries) => sum + entries.length, 0)
}

if (report.invalidLocales.length) {
  console.error(`Invalid locale modules: ${report.invalidLocales.join(', ')}`)
}

if (Object.keys(report.missingNamespaces).length) {
  console.error('Missing namespaces:')
  Object.entries(report.missingNamespaces).forEach(([locale, namespaces]) => {
    console.error(`${locale}: ${namespaces.join(', ')}`)
  })
}

if (Object.keys(report.missing).length) {
  console.error('Missing:')
  Object.entries(report.missing).forEach(([locale, namespaces]) => {
    console.error(`${locale}: ${countEntries(namespaces)}`)
  })
}

if (Object.keys(report.extra).length) {
  console.error('Extra:')
  Object.entries(report.extra).forEach(([locale, namespaces]) => {
    console.error(`${locale}: ${countEntries(namespaces)}`)
  })
}

if (hasIssues) {
  process.exitCode = 1
} else {
  console.log('i18n check passed')
}
