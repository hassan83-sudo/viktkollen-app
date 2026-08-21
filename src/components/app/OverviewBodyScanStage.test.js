import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('OverviewBodyScanStage', () => {
  it('opens from Home as a full-screen kroppsscanning stage with scan facts', () => {
    const dashboardSource = readFileSync(new URL('./OverviewDashboard.jsx', import.meta.url), 'utf8')
    const stageSource = readFileSync(new URL('./OverviewBodyScanStage.jsx', import.meta.url), 'utf8')

    expect(dashboardSource).toContain("onOpenBodyScan={() => setBodyScanOpen(true)}")
    expect(dashboardSource).toContain('OverviewBodyScanStage')
    expect(dashboardSource).toContain("onNavigateSection('progress', 'body-analysis')")
    expect(stageSource).toContain('createPortal')
    expect(stageSource).toContain('getLatestAnalysis')
    expect(stageSource).toContain('Kroppssammansättning')
    expect(stageSource).toContain('Hållning')
    expect(stageSource).toContain('Starta scanning')
    expect(stageSource).toContain('Ny scanning')
    expect(stageSource).toContain('overview-body-scan-stage')
  })
})
