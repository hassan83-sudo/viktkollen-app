import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const readProjectFile = (path) => readFileSync(resolve(projectRoot, path), 'utf8')

describe('Performance Architecture V2 contracts', () => {
  it('keeps cloud and sync implementations out of App static imports', () => {
    const source = readProjectFile('src/App.jsx')

    expect(source).not.toContain("from './services/cloudSyncService.js'")
    expect(source).not.toContain("from './services/cloudBackupSchema.js'")
    expect(source).not.toContain("from './services/sync/cloudSyncEngine.js'")
    expect(source).toContain("const SyncHealthDashboard = lazy(() => import('./components/SyncHealthDashboard.jsx'))")
  })

  it('loads cloud status and sync services through the runtime loader', () => {
    const cloudStatusSource = readProjectFile('src/components/CloudStatusPanel.jsx')
    const cloudSyncSource = readProjectFile('src/components/CloudSyncPanel.jsx')

    expect(cloudStatusSource).toContain("from '../services/cloudRuntimeLoader.js'")
    expect(cloudSyncSource).toContain("from '../services/cloudRuntimeLoader.js'")
    expect(cloudStatusSource).not.toContain("from '../services/cloudSyncService.js'")
    expect(cloudSyncSource).not.toContain("from '../services/sync/cloudSyncEngine.js'")
  })

  it('does not force health/progress services into one initial manual chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain("return 'health-progress-services'")
    expect(source).not.toContain("normalized.includes('/src/services/health')")
    expect(source).not.toContain("normalized.includes('/src/services/progress')")
  })

  it('keeps cloud runtime loader outside the manual cloud-services chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain("return 'cloud-services'")
    expect(source).not.toContain("normalized.includes('/src/services/cloud')")
    expect(source).not.toContain("normalized.includes('/src/services/sync/')")
  })

  it('does not group all nutrition services into one preload chunk', () => {
    const source = readProjectFile('vite.config.js')

    expect(source).not.toContain("return 'nutrition-services'")
    expect(source).not.toContain("normalized.includes('/src/services/nutrition')")
    expect(source).toContain("return 'nutrition-core-services'")
  })
})
