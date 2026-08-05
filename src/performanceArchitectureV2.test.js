import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = dirname(
  fileURLToPath(new URL('../package.json', import.meta.url)),
)

const readProjectFile = (path) =>
  readFileSync(resolve(projectRoot, path), 'utf8')

function readSectionSources() {
  const sectionsDirectory = resolve(
    projectRoot,
    'src/components/sections',
  )

  return readdirSync(sectionsDirectory)
    .filter((fileName) => fileName.endsWith('.jsx'))
    .map((fileName) =>
      readFileSync(resolve(sectionsDirectory, fileName), 'utf8'),
    )
    .join('\n')
}

describe('Performance Architecture V2 contracts', () => {
  it('keeps cloud and sync implementations out of static application imports', () => {
    const appSource = readProjectFile('src/App.jsx')
    const sectionSources = readSectionSources()
    const applicationSource = `${appSource}\n${sectionSources}`

    expect(appSource).not.toContain(
      "from './services/cloudSyncService.js'",
    )
    expect(appSource).not.toContain(
      "from './services/cloudBackupSchema.js'",
    )
    expect(appSource).not.toContain(
      "from './services/sync/cloudSyncEngine.js'",
    )

    expect(appSource).toContain(
      "const SyncHealthDashboard = lazy(() => import('./components/SyncHealthDashboard.jsx'))",
    )
    expect(applicationSource).toContain(
      'const InsightsCenter = lazy(',
    )
    expect(applicationSource).toContain(
      'const AchievementCenter = lazy(',
    )
    expect(applicationSource).toContain(
      'const SocialCenter = lazy(',
    )
    expect(appSource).toContain(
      "const DataImportCenter = lazy(() => import('./components/DataImportCenter.jsx'))",
    )
    expect(appSource).toContain(
      "const DataExportCenter = lazy(() => import('./components/DataExportCenter.jsx'))",
    )

    expect(applicationSource).not.toMatch(
      /import\s+InsightsCenter\s+from/,
    )
    expect(applicationSource).not.toMatch(
      /import\s+AchievementCenter\s+from/,
    )
    expect(applicationSource).not.toMatch(
      /import\s+SocialCenter\s+from/,
    )

    expect(appSource).not.toContain("from './services/import/")
    expect(appSource).not.toContain("from './services/export/")
    expect(appSource).not.toContain(
      "from './services/achievements/",
    )
    expect(appSource).not.toContain("from './services/social/")
    expect(appSource).not.toContain(
      "from './services/notifications/notificationEngine.js'",
    )
  })

  it('loads cloud status and sync services through the runtime loader', () => {
    const cloudStatusSource = readProjectFile(
      'src/components/CloudStatusPanel.jsx',
    )
    const cloudSyncSource = readProjectFile(
      'src/components/CloudSyncPanel.jsx',
    )

    expect(cloudStatusSource).toContain(
      "from '../services/cloudRuntimeLoader.js'",
    )
    expect(cloudSyncSource).toContain(
      "from '../services/cloudRuntimeLoader.js'",
    )
    expect(cloudStatusSource).not.toContain(
      "from '../services/cloudSyncService.js'",
    )
    expect(cloudSyncSource).not.toContain(
      "from '../services/sync/cloudSyncEngine.js'",
    )
  })

  it('does not force health/progress services into one initial manual chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain(
      "return 'health-progress-services'",
    )
    expect(source).not.toContain(
      "normalized.includes('/src/services/health')",
    )
    expect(source).not.toContain(
      "normalized.includes('/src/services/progress')",
    )
  })

  it('keeps cloud runtime loader outside the manual cloud-services chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain("return 'cloud-services'")
    expect(source).not.toContain(
      "normalized.includes('/src/services/cloud')",
    )
    expect(source).not.toContain(
      "normalized.includes('/src/services/sync/')",
    )
  })

  it('does not group all nutrition services into one preload chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain(
      "return 'nutrition-services'",
    )
    expect(source).not.toContain(
      "normalized.includes('/src/services/nutrition')",
    )
    expect(source).toContain(
      "return 'nutrition-core-services'",
    )
  })
})