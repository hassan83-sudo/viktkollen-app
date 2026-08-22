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
    const cssSource = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')

    expect(stageSource).toContain('overview-body-scan-stage')
    expect(stageSource).toContain('is-full-art')
    expect(stageSource).not.toContain('overview-body-scan-float-rings')
    expect(stageSource).not.toContain('is-float-')
    expect(cssSource).toMatch(/\.overview-primary-art\.is-body img \{[\s\S]*?object-fit:\s*contain;/)
    expect(cssSource).toMatch(/\.overview-body-scan-hero img \{[\s\S]*?object-fit:\s*contain;/)
    expect(cssSource).not.toContain('scale(2.05)')
    expect(cssSource).not.toContain('scale(1.72)')
  })
})
