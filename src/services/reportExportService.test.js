import { describe, expect, it, vi } from 'vitest'
import { buildSharedMonthlyReportModel, buildSharedWeeklyReportModel } from './sharedAnalyticsEngine.js'
import {
  buildReportExportText,
  exportReportText,
  getReportExportFilename,
  reportExportMimeType,
  sanitizeReportExportText,
} from './reportExportService.js'

const analysisDate = '2026-07-31'
const data = {
  checkIn: { date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true },
  checkIns: [{ date: analysisDate, energy: 7, mood: 'Fokuserad', steps: 8200, workout: true }],
  meals: [{ calories: 420, date: analysisDate, id: 'meal-1', protein: 35, text: 'Kyckling och ris', type: 'Lunch' }],
  nutritionGoals: { protein: 35 },
  profile: { goalWeight: 78, startWeight: 91.8 },
  today: analysisDate,
  weights: [
    { date: '2026-07-01', value: 91.8 },
    { date: analysisDate, value: 89.6 },
  ],
}

function report(type = 'weekly') {
  return {
    sharedAnalytics: type === 'weekly'
      ? buildSharedWeeklyReportModel(data, { analysisDate })
      : buildSharedMonthlyReportModel(data, { analysisDate }),
  }
}

describe('report export service', () => {
  it('builds stable UTF-8 text for weekly reports', () => {
    const text = buildReportExportText(report('weekly'), { reportType: 'weekly' })

    expect(text).toContain('Viktkollen veckorapport')
    expect(text).toContain('Sammanfattning')
    expect(text).toContain('Datatäckning')
    expect(text).toContain('Trender')
    expect(text).not.toMatch(/token|session|localStorage|diagnostics|base64/i)
  })

  it('builds monthly filenames from report date', () => {
    expect(getReportExportFilename(report('monthly'), { reportType: 'monthly' })).toBe('viktkollen-manadsrapport-2026-07-31.txt')
  })

  it('sanitizes full technical ids', () => {
    expect(sanitizeReportExportText('id 123e4567-e89b-12d3-a456-426614174000')).toBe('id [id]')
  })

  it('blocks sensitive text before download', () => {
    const unsafe = {
      sharedAnalytics: {
        ...report('weekly').sharedAnalytics,
        summaries: {
          ...report('weekly').sharedAnalytics.summaries,
          weight: 'access_token ska inte ut',
        },
      },
    }

    expect(() => buildReportExportText(unsafe, { reportType: 'weekly' })).toThrow(/känsliga/)
  })

  it('uses injected download adapter with MIME type', () => {
    const download = vi.fn()
    const result = exportReportText(report('weekly'), { reportType: 'weekly' }, download)

    expect(download).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'viktkollen-veckorapport-2026-07-31.txt',
      type: reportExportMimeType,
    }))
    expect(result.size).toBeGreaterThan(100)
  })
})
