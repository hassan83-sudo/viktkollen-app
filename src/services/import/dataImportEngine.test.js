import { describe, expect, it } from 'vitest'
import { parseCsv, sanitizeCsvText } from './csvParser.js'
import { applyImportPlan, parseDataImportText, validateImportFileMetadata } from './dataImportEngine.js'
import { detectImportFormat } from './importFormatDetector.js'
import { buildImportPlan } from './importPlanBuilder.js'
import { safeParseJson } from './safeJsonParser.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, value]))
  return {
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => {
      data.set(key, String(value))
    },
    dump: () => Object.fromEntries(data.entries()),
  }
}

function jsonFile(name = 'backup.json', size = 100) {
  return { name, size, type: 'application/json' }
}

describe('Data Import & Migration V2', () => {
  it('rejects empty, oversized and unsupported files before parsing', () => {
    expect(validateImportFileMetadata({ name: 'data.json', size: 0, type: 'application/json' }).ok).toBe(false)
    expect(validateImportFileMetadata({ name: 'data.exe', size: 100, type: 'application/octet-stream' }).ok).toBe(false)
    expect(validateImportFileMetadata({ name: 'data.json', size: 6 * 1024 * 1024, type: 'application/json' }).ok).toBe(false)
  })

  it('accepts safe JSON and strips sensitive keys', () => {
    const parsed = safeParseJson(JSON.stringify({
      session: { access_token: 'secret' },
      userData: { 'viktkollen.weights': [] },
    }))

    expect(parsed.ok).toBe(true)
    expect(parsed.value.session).toBeUndefined()
    expect(parsed.value.userData['viktkollen.weights']).toEqual([])
  })

  it('blocks prototype pollution keys', () => {
    const parsed = safeParseJson('{"__proto__":{"polluted":true}}')

    expect(parsed.ok).toBe(false)
    expect({}.polluted).toBeUndefined()
  })

  it('blocks deeply nested JSON payloads', () => {
    const parsed = safeParseJson('{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":{"l":{"m":{"n":{"o":1}}}}}}}}}}}}}}}')

    expect(parsed.ok).toBe(false)
  })

  it('detects current Viktkollen backup JSON', () => {
    const text = JSON.stringify({
      app: 'Viktkollen',
      schemaVersion: 2,
      userData: { 'viktkollen.weights': [] },
    })

    expect(detectImportFormat({ fileName: 'backup.json', mimeType: 'application/json', text })).toMatchObject({
      detectedFormat: 'viktkollen-backup-v2',
      sourceType: 'viktkollenBackup',
    })
  })

  it('detects legacy backup JSON', () => {
    const text = JSON.stringify({
      app: 'Viktkollen',
      data: { 'viktkollen.weights': [] },
      version: 1,
    })

    expect(detectImportFormat({ fileName: 'backup.json', mimeType: 'application/json', text })).toMatchObject({
      detectedFormat: 'viktkollen-legacy-v1',
      sourceType: 'viktkollenLegacy',
    })
  })

  it('detects unknown JSON without importing automatically', () => {
    const detected = detectImportFormat({ fileName: 'data.json', mimeType: 'application/json', text: '{"hello":true}' })

    expect(detected.sourceType).toBe('unknown')
    expect(detected.confidence).toBeLessThan(0.5)
  })

  it('parses comma, semicolon and tab separated CSV', () => {
    expect(parseCsv('date,weight\n2026-07-31,89.6').rows).toHaveLength(1)
    expect(parseCsv('date;weight\n2026-07-31;89,6').delimiter).toBe(';')
    expect(parseCsv('date\tweight\n2026-07-31\t89.6').delimiter).toBe('\t')
  })

  it('parses quoted multiline CSV values', () => {
    const parsed = parseCsv('date;meal\n2026-07-31;"Pizza\nmed sallad"')

    expect(parsed.ok).toBe(true)
    expect(parsed.rows[0].values.meal).toContain('Pizza')
  })

  it('marks duplicate CSV rows as warnings', () => {
    const parsed = parseCsv('date;weight\n2026-07-31;89,6\n2026-07-31;89,6')

    expect(parsed.warnings).toContain('CSV-filen innehåller dubblettrader.')
    expect(parsed.rows[1].duplicate).toBe(true)
  })

  it('protects CSV preview text from formula injection', () => {
    expect(sanitizeCsvText('=IMPORTXML("x")')).toBe('\'=IMPORTXML("x")')
    expect(sanitizeCsvText('@cmd')).toBe("'@cmd")
  })

  it('creates preview for CSV weight without persisting', () => {
    const storage = createMemoryStorage()
    const session = parseDataImportText({
      file: { name: 'vikt.csv', size: 80, type: 'text/csv' },
      importDate: '2026-07-31T10:00:00.000Z',
      text: 'datum;vikt\n2026-07-31;89,6',
    })

    expect(session.status).toBe('previewReady')
    expect(session.sections[0].key).toBe('viktkollen.weights')
    expect(storage.getItem('viktkollen.weights')).toBeNull()
  })

  it('maps Swedish date and decimal comma for imported weights', () => {
    const session = parseDataImportText({
      file: { name: 'vikt.csv', size: 80, type: 'text/csv' },
      importDate: '2026-07-31T10:00:00.000Z',
      text: 'datum;vikt\n31.07.2026;89,6',
    })

    expect(session.sections[0].value[0]).toMatchObject({ date: '2026-07-31', value: 89.6 })
  })

  it('maps meals CSV into the existing meals key', () => {
    const session = parseDataImportText({
      file: { name: 'mat.csv', size: 120, type: 'text/csv' },
      importDate: '2026-07-31T10:00:00.000Z',
      text: 'datum;namn;protein;kalorier\n2026-07-31;Kyckling och ris;42;560',
    })

    expect(session.sections[0]).toMatchObject({ key: 'viktkollen.meals', itemCount: 1 })
    expect(session.sections[0].value[0].protein).toBe(42)
  })

  it('maps check-in CSV into the existing check-in key', () => {
    const session = parseDataImportText({
      file: { name: 'checkins.csv', size: 120, type: 'text/csv' },
      importDate: '2026-07-31T10:00:00.000Z',
      text: 'datum;energi;humör;steg\n2026-07-31;6;Fokuserad;7200',
    })

    expect(session.sections[0]).toMatchObject({ key: 'viktkollen.checkIn', itemCount: 1 })
  })

  it('plans deterministic safe merge by stable id', () => {
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: {
          'viktkollen.weights': [{ date: '2026-07-31', id: 'w1', value: 89.6 }],
        },
      }),
    })
    const currentData = {
      'viktkollen.weights': [{ date: '2026-07-30', id: 'w0', value: 90.1 }],
    }
    const first = buildImportPlan(session, { currentData })
    const second = buildImportPlan(session, { currentData })

    expect(first).toEqual(second)
    expect(first.okToApply).toBe(true)
    expect(first.additions).toBe(1)
  })

  it('requires manual review for whole-key profile replacement', () => {
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: {
          'viktkollen.profile': { goalWeight: 78 },
        },
      }),
    })
    const plan = buildImportPlan(session, { currentData: { 'viktkollen.profile': { goalWeight: 80 } } })

    expect(plan.okToApply).toBe(false)
    expect(plan.blockingErrors[0].reason).toMatch(/manuell strategi/)
  })

  it('supports explicit replace after preview for whole-key sections', () => {
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: {
          'viktkollen.profile': { goalWeight: 78 },
        },
      }),
    })
    const plan = buildImportPlan(session, {
      currentData: { 'viktkollen.profile': { goalWeight: 80 } },
      strategies: { 'viktkollen.profile': 'replace' },
    })

    expect(plan.okToApply).toBe(true)
    expect(plan.requiresManualConfirmation).toBe(true)
  })

  it('applies a successful plan with snapshot and dirty metadata', () => {
    const storage = createMemoryStorage({
      'viktkollen.weights': JSON.stringify([{ date: '2026-07-30', id: 'w0', value: 90.1 }]),
    })
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: { 'viktkollen.weights': [{ date: '2026-07-31', id: 'w1', value: 89.6 }] },
      }),
    })
    const plan = buildImportPlan(session, {
      currentData: { 'viktkollen.weights': [{ date: '2026-07-30', id: 'w0', value: 90.1 }] },
    })
    const result = applyImportPlan(session, plan, { storage })

    expect(result.ok).toBe(true)
    expect(JSON.parse(storage.getItem('viktkollen.weights'))).toHaveLength(2)
    expect(JSON.parse(storage.getItem('viktkollen.syncMetadata')).pendingKeys).toContain('viktkollen.weights')
  })

  it('rolls back all written keys when a later write fails', () => {
    const storage = createMemoryStorage({
      'viktkollen.meals': JSON.stringify([]),
      'viktkollen.weights': JSON.stringify([{ date: '2026-07-30', id: 'w0', value: 90.1 }]),
    })
    const originalSetItem = storage.setItem
    let failedMealWrite = false
    storage.setItem = (key, value) => {
      if (key === 'viktkollen.meals' && !failedMealWrite) {
        failedMealWrite = true
        throw new Error('quota')
      }
      originalSetItem(key, value)
    }
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: {
          'viktkollen.weights': [{ date: '2026-07-31', id: 'w1', value: 89.6 }],
          'viktkollen.meals': [{ id: 'm1', text: 'Pizza', date: '2026-07-31' }],
        },
      }),
    })
    const plan = buildImportPlan(session, {
      currentData: {
        'viktkollen.meals': [],
        'viktkollen.weights': [{ date: '2026-07-30', id: 'w0', value: 90.1 }],
      },
    })
    const result = applyImportPlan(session, plan, { storage })

    expect(result.ok).toBe(false)
    expect(result.restored).toBe(true)
    expect(JSON.parse(storage.getItem('viktkollen.weights'))).toEqual([{ date: '2026-07-30', id: 'w0', value: 90.1 }])
  })

  it('blocks double submit while an import is active by refusing invalid plans', () => {
    const result = applyImportPlan({ importId: 'x' }, { okToApply: false })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/inte redo/)
  })

  it('blocks apply if the current user changed', () => {
    const session = parseDataImportText({
      file: jsonFile(),
      importDate: '2026-07-31T10:00:00.000Z',
      text: JSON.stringify({
        app: 'Viktkollen',
        schemaVersion: 2,
        userData: { 'viktkollen.weights': [{ date: '2026-07-31', id: 'w1', value: 89.6 }] },
      }),
    })
    const plan = buildImportPlan(session, { currentData: { 'viktkollen.weights': [] } })
    const result = applyImportPlan(session, plan, { currentUserId: 'b', expectedUserId: 'a', storage: createMemoryStorage() })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Användaren ändrades/)
  })
})
