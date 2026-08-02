import { buildSharedReportUiModel } from './sharedReportUiModel.js'

export const reportExportVersion = 4
export const reportExportMimeType = 'text/plain;charset=utf-8'
export const maxReportExportBytes = 80_000

const blockedPatterns = [
  /access_token/i,
  /authorization/i,
  /base64/i,
  /chat history/i,
  /deviceId/i,
  /diagnostics/i,
  /email/i,
  /localStorage/i,
  /password/i,
  /refresh_token/i,
  /server payload/i,
  /session/i,
  /supabase/i,
  /tabId/i,
  /token/i,
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

export function sanitizeReportExportText(value) {
  return String(value ?? '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .trim()
}

function appendList(lines, title, items, mapItem = (item) => item) {
  lines.push('', title)
  const entries = safeArray(items)
  if (!entries.length) {
    lines.push('- Saknas')
    return
  }
  entries.forEach((item) => lines.push(`- ${sanitizeReportExportText(mapItem(item))}`))
}

export function buildReportExportText(report = {}, options = {}) {
  const model = buildSharedReportUiModel(report, options)
  const lines = [
    `Viktkollen ${model.reportType === 'weekly' ? 'veckorapport' : 'månadsrapport'}`,
    `Period: ${sanitizeReportExportText(model.periodLabel)}`,
    `Datum: ${sanitizeReportExportText(model.generatedAt || model.period?.end || '')}`,
    `Källa: registrerad data via Shared Analytics Engine`,
    '',
    'Sammanfattning',
    `Vikt: ${sanitizeReportExportText(model.overview.weight)}`,
    `Nutrition: ${sanitizeReportExportText(model.overview.nutrition)}`,
    `Aktivitet: ${sanitizeReportExportText(model.overview.activity)}`,
    '',
    'Datatäckning',
    sanitizeReportExportText(model.dataQuality.text),
    `Måltidsdagar: ${model.dataQuality.mealDays} av ${model.dataQuality.periodDays}`,
    `Viktmätningar: ${model.dataQuality.weightDays}`,
    `Check-ins: ${model.dataQuality.checkInDays} av ${model.dataQuality.periodDays}`,
  ]

  appendList(lines, 'Trender', model.trendCards, (card) => `${card.label}: ${card.summary} Snitt ${card.averageLabel}. Coverage ${card.coverageLabel}.`)
  appendList(lines, 'Jämförelser', model.comparisonCards, (card) => `${card.title}: ${card.explanation}. Status ${card.status}.`)
  appendList(lines, 'Highlights', model.highlights, (item) => `${item.title}: ${item.text}`)
  appendList(lines, 'Uppmärksamhet', model.attentionItems, (item) => `${item.title}: ${item.text}${item.action ? ` Nästa steg: ${item.action}` : ''}`)
  appendList(lines, 'Nästa steg', model.nextActions, (item) => `${item.title}: ${item.text}`)

  lines.push('', 'Mål & vanor')
  lines.push(model.goalsHabits ? sanitizeReportExportText(model.goalsHabits.summary) : 'Saknas')
  lines.push('', 'Obs: Rapporten är allmänt stöd för hälsa och vanor, inte medicinsk rådgivning.')

  const text = `${lines.join('\n')}\n`
  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    throw new Error('Rapportexporten stoppades eftersom känsliga fält upptäcktes.')
  }
  if (new Blob([text]).size > maxReportExportBytes) {
    throw new Error('Rapportexporten blev för stor.')
  }

  return text
}

export function getReportExportFilename(report = {}, options = {}) {
  const model = buildSharedReportUiModel(report, options)
  const type = model.reportType === 'weekly' ? 'veckorapport' : 'manadsrapport'
  const date = sanitizeReportExportText(model.generatedAt || model.period?.end || new Date().toISOString().slice(0, 10)).slice(0, 10) || 'rapport'

  return `viktkollen-${type}-${date}.txt`
}

export function createBrowserDownloadAdapter(win = window, doc = document) {
  return function downloadText({ filename, text, type }) {
    const blob = new Blob([text], { type })
    const url = win.URL.createObjectURL(blob)
    const link = doc.createElement('a')

    link.href = url
    link.download = filename
    link.click()
    win.URL.revokeObjectURL(url)
  }
}

export function exportReportText(report = {}, options = {}, download = createBrowserDownloadAdapter()) {
  const text = buildReportExportText(report, options)
  const filename = getReportExportFilename(report, options)

  download({ filename, text, type: reportExportMimeType })

  return {
    filename,
    size: new Blob([text]).size,
    text,
    type: reportExportMimeType,
    version: reportExportVersion,
  }
}
