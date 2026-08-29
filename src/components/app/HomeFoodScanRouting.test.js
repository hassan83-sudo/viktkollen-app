import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewDashboard.jsx'), 'utf8')

describe('Home Matscanning routing', () => {
  it('never opens a hardcoded demo plate - it falls through to the real onScanFood navigation', () => {
    expect(dashboardSource).not.toContain('OverviewFoodScanStage')
    expect(dashboardSource).not.toContain('foodScanOpen')
    expect(dashboardSource).not.toMatch(/onOpenFoodScan=\{\(\) => setFoodScanOpen/)
    expect(dashboardSource).not.toMatch(/kyckling|avokado|broccoli/i)
  })

  it('routes the Smart Camera food adapter to the real onScanFood callback too', () => {
    expect(dashboardSource).toMatch(/onOpenFoodScan:\s*\(\)\s*=>\s*\{[\s\S]{0,80}onScanFood\?\.\(\)/)
  })
})
