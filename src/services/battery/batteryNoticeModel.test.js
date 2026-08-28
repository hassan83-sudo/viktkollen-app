import { describe, expect, it } from 'vitest'
import {
  addBatteryMeasurement,
  calculateBatteryInsights,
  createBatteryRecommendation,
  getBatteryCapabilities,
  normalizeBatteryNoticeState,
} from './batteryNoticeModel.js'

describe('batteryNoticeModel', () => {
  it('normalizes local-first state without backend identifiers', () => {
    const state = normalizeBatteryNoticeState({
      enabled: true,
      history: [{ percent: 101, charging: false, measuredAt: '2026-08-28T06:00:00.000Z', source: 'api' }],
      safetyMarginHours: 12,
      targetReadyAt: 'bad',
    })

    expect(state).toMatchObject({
      enabled: true,
      safetyMarginHours: 6,
      targetReadyAt: '07:30',
      version: 1,
    })
    expect(state.history[0]).toMatchObject({ percent: 100, source: 'api' })
  })

  it('throttles identical samples but stores changed readings', () => {
    const state = addBatteryMeasurement({}, {
      charging: false,
      measuredAt: '2026-08-28T06:00:00.000Z',
      percent: 80,
      source: 'manual',
    })
    const throttled = addBatteryMeasurement(state, {
      charging: false,
      measuredAt: '2026-08-28T06:05:00.000Z',
      percent: 80,
      source: 'manual',
    })
    const changed = addBatteryMeasurement(throttled, {
      charging: false,
      measuredAt: '2026-08-28T06:06:00.000Z',
      percent: 79,
      source: 'manual',
    })

    expect(throttled.history).toHaveLength(1)
    expect(changed.history).toHaveLength(2)
  })

  it('calculates average drain only after enough unplugged samples', () => {
    const state = normalizeBatteryNoticeState({
      enabled: true,
      history: [
        { charging: false, measuredAt: '2026-08-28T06:00:00.000Z', percent: 90, source: 'manual' },
        { charging: false, measuredAt: '2026-08-28T07:00:00.000Z', percent: 80, source: 'manual' },
        { charging: false, measuredAt: '2026-08-28T08:00:00.000Z', percent: 70, source: 'manual' },
        { charging: false, measuredAt: '2026-08-28T09:00:00.000Z', percent: 60, source: 'manual' },
      ],
    })

    const insights = calculateBatteryInsights(state, { now: '2026-08-28T10:00:00.000Z' })
    const recommendation = createBatteryRecommendation(state, { now: '2026-08-28T10:00:00.000Z' })

    expect(insights).toMatchObject({ enoughData: true, sampleCount: 3, todayConsumption: 30 })
    expect(insights.averageDrainPerHour).toBe(10)
    expect(recommendation.reminderPercent).toBe(85)
  })

  it('models iPhone and browser limits honestly', () => {
    const capabilities = getBatteryCapabilities({
      matchMedia: () => ({ matches: false }),
      navigator: { getBattery: undefined, platform: 'iPhone', userAgent: 'iPhone' },
    })

    expect(capabilities).toMatchObject({
      automaticRead: false,
      backgroundMonitoring: false,
      manualEntry: true,
      platform: 'iphone',
      requiresOpenApp: true,
    })
  })
})
