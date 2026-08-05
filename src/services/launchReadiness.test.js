import { describe, expect, it } from 'vitest'
import { buildLaunchReadinessReport } from './launchReadiness.js'

describe('launchReadiness', () => {
  it('builds a masked development readiness report', () => {
    const report = buildLaunchReadinessReport({
      authSession: { user: { id: 'user-1234567890', email: 'person@example.com' } },
      healthSnapshot: { availability: { weight: true }, date: '2026-07-31', nutrition: { mealCount: 2 } },
      reminderState: { reminders: [{ id: 'r1', title: 'Check-in', time: '09:00' }] },
      syncStatus: { status: 'ok', userId: 'user-1234567890' },
    })

    expect(report.auth.signedIn).toBe(true)
    expect(report.healthSnapshot.mealsToday).toBe(2)
    expect(report.photoAnalysis.routeConfigured).toBe('api/nutrition-photo-analysis')
    expect(report.photoAnalysis.maxFileSizeMb).toBe(8)
    expect(report.sync.syncHealth).toBe('unknown')
    expect(report.sync.queueHealth).toBe('unknown')
    expect(report.diagnostics.analyticsHealth).toBeTruthy()
    expect(report.diagnostics.predictionEngine).toBe('pass')
    expect(report.diagnostics.predictionUi).toBe('lazy-loaded')
    expect(report.diagnostics.predictionAiIntegration).toBe('consent-gated-aggregate-summary')
    expect(report.diagnostics.performanceDiagnostics).toBe('read-only')
    expect(report.diagnostics.runtimeAnalyticsCache).toMatch(/\d+\/\d+/)
    expect(report.performance.storagePressure.totalBand).toBeTruthy()
    expect(report.diagnostics.trendCoverage).toMatch(/%/)
    expect(report.reminders.enabledCount).toBe(1)
    expect(JSON.stringify(report)).not.toContain('person@example.com')
    expect(JSON.stringify(report)).not.toContain('user-1234567890')
  })
})
