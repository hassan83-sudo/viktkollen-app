import { describe, expect, it, vi } from 'vitest'
import { parseDataImportText } from '../import/dataImportEngine.js'
import { buildImportPlan } from '../import/importPlanBuilder.js'
import { buildDataExportDraft, verifyExportDraft } from './dataExportEngine.js'
import { buildCheckInsCsv, buildMealsCsv, buildWeightCsv, csvExportInternals } from './csvExport.js'
import { downloadExportDraft, sanitizeExportFilename } from './downloadService.js'
import { getDefaultExportSectionIds, getExportStorageKeys, getExportableSections, isBlockedExportField } from './exportSchema.js'

const exportDate = '2026-07-31T10:00:00.000Z'
const currentData = {
  'viktkollen.adaptiveCoach.v1': { recommendations: [{ id: 'c1', status: 'completed' }] },
  'viktkollen.checkIn': { date: '2026-07-31', energy: 6, mood: 'Fokuserad', steps: 7200, workout: true },
  'viktkollen.goalsHabits.v2': { habits: [{ archived: true, id: 'h1', title: 'Promenad' }] },
  'viktkollen.meals': [
    {
      calories: 800,
      date: '2026-07-31',
      id: 'm1',
      photoAnalysis: { confidence: 'medium', image: 'data:image/png;base64,abc', provider: 'mock', userEdited: true },
      planned: true,
      protein: 32,
      text: '=Pizza',
      time: '18:00',
      type: 'Middag',
    },
  ],
  'viktkollen.profile': { access_token: 'secret', goalWeight: 78, name: 'Test' },
  'viktkollen.reminders.v2': { reminders: [{ enabled: true, id: 'r1', title: 'Check-in' }], schemaVersion: 2 },
  'viktkollen.weights': [{ date: '2026-07-31', id: 'w1', note: '@note', value: 89.6 }],
}

describe('Data Export & Portability V2', () => {
  it('defines structural export sections from allowlisted user data keys', () => {
    const sections = getExportableSections()

    expect(sections.length).toBeGreaterThan(5)
    expect(sections.map((section) => section.id)).toContain('achievements')
    expect(sections.find((section) => section.id === 'adaptiveCoach')?.label).toMatch(/action plans/i)
    expect(getExportStorageKeys(getDefaultExportSectionIds())).toContain('viktkollen.weights')
    expect(getExportStorageKeys(getDefaultExportSectionIds())).not.toContain('viktkollen.syncMetadata')
    expect(getExportStorageKeys(['achievements'])).toEqual(['viktkollen.goalsHabits.v2'])
  })

  it('blocks auth, session, tokens, diagnostics and image fields', () => {
    expect(isBlockedExportField('access_token')).toBe(true)
    expect(isBlockedExportField('refresh_token')).toBe(true)
    expect(isBlockedExportField('supabaseSession')).toBe(true)
    expect(isBlockedExportField('diagnostics')).toBe(true)
    expect(isBlockedExportField('image')).toBe(true)
  })

  it('builds a full backup without sensitive fields or base64 images', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['profile', 'meals', 'weightLog'] })
    const payload = JSON.parse(draft.payloadText)

    expect(draft.validation.ok).toBe(true)
    expect(payload.schemaVersion).toBe(2)
    expect(payload.userData['viktkollen.profile'].access_token).toBeUndefined()
    expect(payload.userData['viktkollen.meals'][0].photoAnalysis.image).toBeUndefined()
    expect(JSON.stringify(payload.userData)).not.toMatch(/access_token|data:image|base64|refresh_token|Supabase/i)
  })

  it('supports selective export and empty section warnings', () => {
    const draft = buildDataExportDraft({ currentData: {}, exportDate, selectedSections: ['weightLog'] })

    expect(draft.sectionSummaries).toHaveLength(1)
    expect(draft.warnings.join(' ')).toContain('Vikt saknar data')
  })

  it('adds integrity metadata and stable non-cryptographic checksums', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const payload = JSON.parse(draft.payloadText)

    expect(payload.integrity.checksumKind).toBe('stable-non-cryptographic')
    expect(payload.integrity.sectionChecksums['viktkollen.weights']).toMatch(/^vk-/)
  })

  it('is deterministic for the same state and export date', () => {
    const first = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const second = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })

    expect(first.payloadText).toBe(second.payloadText)
    expect(first.exportId).toBe(second.exportId)
  })

  it('verifies backup compatibility with Data Import V2 without applying it', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const verification = verifyExportDraft(draft)

    expect(verification.status).toBe('verified')
    expect(verification.importSession.sections[0].key).toBe('viktkollen.weights')
  })

  it('returns a safe invalid result for malformed JSON instead of throwing', () => {
    const verification = verifyExportDraft({
      estimatedSize: 20,
      exportDate,
      filename: 'broken.json',
      format: 'viktkollenBackup',
      payloadText: '{"broken":',
    })

    expect(verification.status).toBe('invalid')
    expect(verification.errors[0]).toContain('JSON')
  })

  it('roundtrips exported weight into an import plan without writes', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const session = parseDataImportText({
      file: { name: draft.filename, size: draft.estimatedSize, type: 'application/json' },
      importDate: exportDate,
      text: draft.payloadText,
    })
    const plan = buildImportPlan(session, { currentData: { 'viktkollen.weights': [] } })

    expect(plan.okToApply).toBe(true)
    expect(plan.additions).toBe(1)
  })

  it('preserves planned meals, archived habits and reminder status in supported fields', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['meals', 'goalsHabits', 'reminders'] })
    const payload = JSON.parse(draft.payloadText)

    expect(payload.userData['viktkollen.meals'][0].planned).toBe(true)
    expect(payload.userData['viktkollen.goalsHabits.v2'].habits[0].archived).toBe(true)
    expect(payload.userData['viktkollen.reminders.v2'].reminders[0].enabled).toBe(true)
  })

  it('builds meals CSV with BOM, semicolon and formula injection protection', () => {
    const csv = buildMealsCsv(currentData['viktkollen.meals'])

    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('id;date;time')
    expect(csv).toContain('sourceCategory;nutritionProvenance')
    expect(csv).toContain("'=Pizza")
  })

  it('builds weight CSV with decimal comma and dangerous note neutralized', () => {
    const csv = buildWeightCsv(currentData['viktkollen.weights'])

    expect(csv).toContain('89,6')
    expect(csv).toContain("'@note")
  })

  it('builds check-in CSV without raw booleans as training labels', () => {
    const csv = buildCheckInsCsv(currentData['viktkollen.checkIn'])

    expect(csv).toContain('Träning markerad')
    expect(csv).not.toMatch(/;true|;false/)
  })

  it('quotes multiline CSV values', () => {
    const csv = buildMealsCsv([{ id: 'm2', text: 'Rad 1\nRad 2', date: '2026-07-31' }])

    expect(csv).toContain('"Rad 1\nRad 2"')
  })

  it('supports comma delimiter and decimal point when selected', () => {
    const csv = buildWeightCsv(currentData['viktkollen.weights'], { decimalSeparator: '.', delimiter: ',' })

    expect(csv).toContain('89.6')
    expect(csv.split('\n')[0]).toBe('\uFEFFid,date,weight,unit,note')
  })

  it('exports CSV that Data Import V2 can preview', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, format: 'csvWeight' })

    expect(draft.validation.ok).toBe(true)
    expect(draft.validation.verification.status).toBe('verified')
  })

  it('creates text summaries that are not advertised as importable backups', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, format: 'textSummary', selectedSections: ['weightLog'] })

    expect(draft.mimeType).toContain('text/plain')
    expect(draft.validation.verification.warnings[0]).toContain('inte ett importformat')
  })

  it('creates safe filenames and removes path traversal characters', () => {
    expect(sanitizeExportFilename('../secret/viktkollen:backup', 'json')).toBe('secret-viktkollen-backup.json')
  })

  it('downloads only an already prepared draft', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const adapter = vi.fn(() => ({ ok: true, reason: 'ok', size: 12 }))
    const result = downloadExportDraft(draft, { currentUserId: 'u1', expectedUserId: 'u1' }, adapter)

    expect(result.ok).toBe(true)
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({ filename: draft.filename, type: draft.mimeType }))
  })

  it('blocks download when user changed', () => {
    const draft = buildDataExportDraft({ currentData, exportDate, selectedSections: ['weightLog'] })
    const result = downloadExportDraft(draft, { currentUserId: 'u2', expectedUserId: 'u1' }, vi.fn())

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Användaren ändrades/)
  })

  it('does not include raw JSON in CSV cells', () => {
    const row = csvExportInternals.mealRows([{
      calories: 420,
      id: 'm1',
      photoAnalysis: { provenance: 'ai_estimate', provider: { type: 'mock' }, source: 'photoAnalysis' },
      text: 'Kyckling',
    }])[0]

    expect(Object.values(row).join(' ')).not.toContain('[object Object]')
    expect(row.sourceCategory).toBe('photo_analysis')
    expect(row.nutritionProvenance).toBe('ai_estimated')
  })

  it('limits oversized arrays without exporting the full history', () => {
    const draft = buildDataExportDraft({
      currentData: { 'viktkollen.meals': Array.from({ length: 6000 }, (_, index) => ({ id: `m${index}`, text: 'Mat', date: '2026-07-31' })) },
      exportDate,
      selectedSections: ['meals'],
    })
    const payload = JSON.parse(draft.payloadText)

    expect(payload.userData['viktkollen.meals']).toHaveLength(5000)
    expect(draft.excludedFields).toContain('Begränsad historikarray')
  })
})
