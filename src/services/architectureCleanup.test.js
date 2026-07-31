import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalizeCheckInMetrics } from './checkInNormalization.js'
import { formatWeightChange } from './healthFormatting.js'
import { buildHealthSnapshot, validateHealthSnapshot } from './healthSnapshot.js'
import { getLocalDateRange, getLocalDateString } from './localDate.js'

const servicesDir = fileURLToPath(new URL('.', import.meta.url))
const srcDir = path.resolve(servicesDir, '..')
const centralModules = [
  'healthSnapshot.js',
  'localDate.js',
  'healthFormatting.js',
  'checkInNormalization.js',
  'checkInWorkout.js',
  'healthCalculations.js',
]

function readSource(relativePath) {
  return readFileSync(path.join(srcDir, relativePath), 'utf8')
}

function getImports(relativePath) {
  const source = readSource(relativePath)
  const imports = []
  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g
  let match = importPattern.exec(source)

  while (match) {
    imports.push(match[1])
    match = importPattern.exec(source)
  }

  return imports
}

function resolveCentralImport(fromFile, importPath) {
  if (!importPath.startsWith('.')) return ''

  const resolved = path.normalize(path.join(path.dirname(fromFile), importPath))
  const withExtension = resolved.endsWith('.js') ? resolved : `${resolved}.js`
  const fileName = path.basename(withExtension)

  return centralModules.includes(fileName) ? fileName : ''
}

function buildCentralGraph() {
  return centralModules.reduce((graph, moduleName) => {
    graph[moduleName] = getImports(`services/${moduleName}`)
      .map((importPath) => resolveCentralImport(moduleName, importPath))
      .filter(Boolean)

    return graph
  }, {})
}

function hasCycle(graph) {
  const visiting = new Set()
  const visited = new Set()

  function visit(node) {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false

    visiting.add(node)
    const cyclic = (graph[node] || []).some(visit)
    visiting.delete(node)
    visited.add(node)

    return cyclic
  }

  return Object.keys(graph).some(visit)
}

describe('architecture cleanup guardrails', () => {
  it('imports central modules in isolation', async () => {
    const modules = await Promise.all(
      centralModules.map((moduleName) =>
        import(pathToFileURL(path.join(servicesDir, moduleName)).href)),
    )

    expect(modules.every((module) => module && typeof module === 'object')).toBe(true)
  })

  it('keeps central modules free from forbidden UI and AI imports', () => {
    const forbidden = {
      'checkInNormalization.js': [/aiCoach/i, /aiFallback/i],
      'healthFormatting.js': [/react/i, /dashboard/i, /components/i],
      'healthSnapshot.js': [/components/i, /React/i, /ChatPanel/i, /Dashboard\.jsx/i],
      'localDate.js': [/dashboard/i, /aiCoach/i, /components/i],
    }

    Object.entries(forbidden).forEach(([moduleName, patterns]) => {
      const source = readSource(`services/${moduleName}`)

      patterns.forEach((pattern) => {
        expect(source).not.toMatch(pattern)
      })
    })
  })

  it('has no circular dependencies between central modules', () => {
    expect(hasCycle(buildCentralGraph())).toBe(false)
  })

  it('does not use the removed nutrition dashboard legacy wrapper', () => {
    const source = readFileSync(path.join(srcDir, 'components/nutritionDashboard/nutritionDashboardViewModel.js'), 'utf8')

    expect(source).not.toContain('makeLegacyNutritionDashboardProgress')
  })

  it('keeps previous formatting date check-in and snapshot behavior intact', () => {
    const snapshot = buildHealthSnapshot({
      checkIn: { date: '2026-07-31', energy: 8, mood: 'good', sleep: 7.5, steps: 9200, workout: true },
      meals: [{ calories: 400, date: '2026-07-31', id: 'meal-1', protein: 30 }],
      profile: { goalWeight: 78, startWeight: 91.8 },
      today: '2026-07-31',
      weights: [
        { date: '2026-07-01', value: 91.8 },
        { date: '2026-07-31', value: 89.6 },
      ],
    })

    expect(validateHealthSnapshot(snapshot).ok).toBe(true)
    expect(formatWeightChange(-2.2)).toBe('-2,2 kg')
    expect(getLocalDateString('2026-07-31T23:30:00.000Z')).toBe('2026-08-01')
    expect(getLocalDateRange(7, '2026-07-31')).toMatchObject({ end: '2026-07-31', start: '2026-07-25' })
    expect(normalizeCheckInMetrics({ workout: true }).workout.displayLabel).toBe('Träning markerad')
  })
})
