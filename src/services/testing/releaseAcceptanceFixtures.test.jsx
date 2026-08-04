import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ManualAcceptanceRunner from '../../components/ManualAcceptanceRunner.jsx'
import {
  acceptanceStatuses,
  createAcceptanceResult,
  serializeAcceptanceResult,
  validateAcceptanceResult,
} from './acceptanceResultModel.js'
import {
  cleanupReleaseAcceptanceFixtures,
  createReleaseAcceptanceFixtureData,
  installReleaseAcceptanceFixtures,
  previewReleaseAcceptanceFixtureCleanup,
  releaseAcceptanceTestMarker,
} from './releaseAcceptanceFixtures.js'
import {
  buildMultiDeviceAcceptanceStatus,
  createMarkedSyncTestPost,
} from './multiDeviceAcceptanceHarness.js'

function createMemoryRepository() {
  const state = {
    adaptiveCoachFeedback: {},
    checkIn: {},
    goalsHabits: {},
    meals: [],
    profile: null,
    remindersV2: {},
    weights: [],
  }

  return {
    getAdaptiveCoachFeedback: () => state.adaptiveCoachFeedback,
    getCheckIn: () => state.checkIn,
    getGoalsHabits: () => state.goalsHabits,
    getMeals: () => state.meals,
    getProfile: () => state.profile,
    getRemindersV2: () => state.remindersV2,
    getWeights: () => state.weights,
    saveAdaptiveCoachFeedback: (value) => { state.adaptiveCoachFeedback = value },
    saveCheckIn: (value) => { state.checkIn = value },
    saveGoalsHabits: (value) => { state.goalsHabits = value },
    saveMeals: (value) => { state.meals = value },
    saveProfile: (value) => { state.profile = value },
    saveRemindersV2: (value) => { state.remindersV2 = value },
    saveWeights: (value) => { state.weights = value },
    state,
  }
}

describe('release acceptance fixtures', () => {
  it('creates deterministic TESTDATA without private content', () => {
    const fixtures = createReleaseAcceptanceFixtureData({ fixtureDate: '2026-08-04', mode: 'test' })
    const serialized = JSON.stringify(fixtures)

    expect(serialized).toContain(releaseAcceptanceTestMarker)
    expect(serialized).toContain('TESTDATA')
    expect(serialized).not.toMatch(/password|token|secret/i)
  })

  it('is development/test only', () => {
    expect(() => createReleaseAcceptanceFixtureData({ mode: 'production' })).toThrow(/development\/test/)
  })

  it('installs and cleans only marked fixture data with explicit confirm', () => {
    const repository = createMemoryRepository()
    repository.state.weights = [{ id: 'real-weight', value: 88 }]

    installReleaseAcceptanceFixtures({ mode: 'test', repository })
    expect(repository.state.weights).toHaveLength(3)

    const preview = previewReleaseAcceptanceFixtureCleanup(repository.state)
    expect(preview.total).toBeGreaterThan(0)

    const dryRun = cleanupReleaseAcceptanceFixtures({ mode: 'test', repository })
    expect(dryRun.ok).toBe(false)
    expect(repository.state.weights).toHaveLength(3)

    const cleanup = cleanupReleaseAcceptanceFixtures({ confirm: true, mode: 'test', repository })
    expect(cleanup.ok).toBe(true)
    expect(repository.state.weights).toEqual([{ id: 'real-weight', value: 88 }])
  })
})

describe('acceptance result model', () => {
  it('serializes automated manual blocked failed and not-run statuses safely', () => {
    const result = createAcceptanceResult({
      checks: [
        { area: 'pwa', id: 'auto', status: acceptanceStatuses.automatedPass },
        { area: 'auth', id: 'manual', status: acceptanceStatuses.manuallyVerified, safeEvidence: 'Observed in browser' },
        { area: 'rls', blocker: 'Needs Test User B', id: 'blocked', status: acceptanceStatuses.blockedByEnvironment },
        { area: 'sync', id: 'failed', status: acceptanceStatuses.failed },
        { area: 'photo', id: 'not-run', status: acceptanceStatuses.notRun },
      ],
    })

    expect(validateAcceptanceResult(result).ok).toBe(true)
    expect(result.summary.manuallyVerified).toBe(1)
    expect(serializeAcceptanceResult(result)).not.toMatch(/token|secret|sk-/i)
  })

  it('redacts unsafe notes and does not create false manual verification', () => {
    const result = createAcceptanceResult({
      checks: [{ id: 'unsafe', notes: 'token abc', status: 'unknown-status' }],
    })

    expect(result.checks[0].status).toBe(acceptanceStatuses.notRun)
    expect(result.checks[0].notes).toContain('[redacted]')
  })
})

describe('multi-device acceptance harness', () => {
  it('masks device IDs and summarizes queues without raw payloads', () => {
    const status = buildMultiDeviceAcceptanceStatus({
      deviceId: 'device-1234567890abcdef',
      syncStatus: { conflicts: [{}], pendingDownloads: 2, pendingUploads: 1, syncHealth: 'ok' },
    })

    expect(status.deviceIdMasked).toBe('device...cdef')
    expect(status.pendingQueue).toBe(3)
    expect(JSON.stringify(status)).not.toContain('1234567890abcdef')
  })

  it('creates marked sync test posts', () => {
    const post = createMarkedSyncTestPost({ kind: 'weight' })

    expect(post.testMarker).toBe(releaseAcceptanceTestMarker)
    expect(post.value).toBe(89.6)
  })
})

describe('ManualAcceptanceRunner', () => {
  it('renders steps status controls export and device status', () => {
    const html = renderToStaticMarkup(
      <ManualAcceptanceRunner
        syncStatus={{ deviceId: 'device-abcdef123456', pendingUploads: 1, syncHealth: 'ok' }}
      />,
    )

    expect(html).toContain('Manual Acceptance Runner')
    expect(html).toContain('Skapa TESTDATA')
    expect(html).toContain('Exportera resultat')
    expect(html).toContain('MRA2-AUTH')
    expect(html).not.toContain('abcdef123456')
    expect(html).not.toContain('[object Object]')
  })
})
