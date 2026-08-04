import { describe, expect, it } from 'vitest'
import { buildFriendModel } from './friendEngine.js'
import { buildOptInLeaderboard, validateLeaderboardMetric } from './leaderboardEngine.js'
import { anonymizeText, buildPrivacyReadiness, sanitizeSharePayload } from './privacyEngine.js'
import { buildSharePreview, createLocalShareToken } from './shareEngine.js'
import { buildSocialModel, buildSocialSummary } from './socialEngine.js'

const today = '2026-08-04'

function baseData(overrides = {}) {
  return {
    checkIn: { date: today, energy: 7, mood: 'Fokuserad', steps: 7200 },
    goalsHabits: {
      goals: [{ id: 'g1', status: 'active', title: 'Protein' }],
      habits: [{ completedDates: [today], id: 'h1', status: 'active', title: 'Promenad' }],
    },
    meals: [{ date: today, id: 'm1', protein: 30, text: 'Kyckling' }],
    profile: { email: 'secret@example.com', goalWeight: 78, name: 'Test' },
    socialState: {
      friends: [{ accountabilityPartner: true, displayName: 'Sara', id: 'f1', status: 'accepted' }],
      invites: [{ id: 'i1', status: 'sent', visibility: 'shared' }],
      leaderboardEntries: [{ achievementXp: 120, friend: { displayName: 'Sara', id: 'f1', status: 'accepted' } }],
      privacy: {
        achievementSharing: 'shared',
        leaderboardOptIn: true,
        progressSharing: 'private',
        shareDisplayName: 'Testperson',
        weeklySummarySharing: 'shared',
      },
      sharedChallenges: [{ id: 'c1', status: 'active' }],
      sharedGoals: [{ id: 'sg1', status: 'shared' }],
    },
    today,
    weights: [
      { date: '2026-07-01', value: 91.8 },
      { date: today, value: 89.6 },
    ],
    ...overrides,
  }
}

describe('privacyEngine', () => {
  it('anonymizes direct identifiers and strips blocked fields from share payloads', () => {
    const payload = sanitizeSharePayload({
      email: 'secret@example.com',
      focus: 'Bra vecka för secret@example.com',
      rawWeight: 89.6,
      safeScore: 80,
    })

    expect(payload.email).toBeUndefined()
    expect(payload.rawWeight).toBeUndefined()
    expect(payload.focus).toContain('[maskerad e-post]')
    expect(payload.safeScore).toBe(80)
    expect(anonymizeText('id 123456789')).toContain('[maskerat id]')
  })

  it('defaults to private progress and no leaderboard', () => {
    const readiness = buildPrivacyReadiness({})

    expect(readiness.privateByDefault).toBe(true)
    expect(readiness.leaderboardOptIn).toBe(false)
  })
})

describe('friendEngine and leaderboardEngine', () => {
  it('normalizes friends, partners and invites', () => {
    const model = buildFriendModel(baseData().socialState, { analysisDate: today })

    expect(model.activeFriendCount).toBe(1)
    expect(model.partnerCount).toBe(1)
    expect(model.pendingInviteCount).toBe(1)
  })

  it('keeps leaderboard disabled until explicit opt-in', () => {
    const model = buildOptInLeaderboard({ privacy: { leaderboardOptIn: false } })

    expect(model.enabled).toBe(false)
    expect(model.entries).toEqual([])
  })

  it('allows only safe leaderboard metrics', () => {
    expect(validateLeaderboardMetric('weightLoss').ok).toBe(false)
    expect(validateLeaderboardMetric('achievementXp').ok).toBe(true)
  })
})

describe('shareEngine and socialEngine', () => {
  it('creates local share tokens without network assumptions', () => {
    const token = createLocalShareToken({ focus: 'Veckosummering' }, { createdAt: '2026-08-04T12:00:00.000Z' })

    expect(token.localOnly).toBe(true)
    expect(token.token).toContain('local-')
  })

  it('builds safe share previews from existing data', () => {
    const preview = buildSharePreview(baseData(), { analysisDate: today, createdAt: '2026-08-04T12:00:00.000Z' })

    expect(preview.allowed).toBe(true)
    expect(preview.previewText).toContain('Testperson')
    expect(JSON.stringify(preview.payload)).not.toMatch(/secret@example.com|rawWeight|accessToken/)
  })

  it('builds social model and summary without inventing data', () => {
    const model = buildSocialModel(baseData(), { analysisDate: today })
    const summary = buildSocialSummary(baseData(), { analysisDate: today })

    expect(model.summary.friendCount).toBe(1)
    expect(model.accountability.partnerCount).toBe(1)
    expect(model.sharing.sharedGoalCount).toBe(1)
    expect(model.leaderboard.enabled).toBe(true)
    expect(summary.sharingReady).toBe(true)
  })

  it('does not leak technical values in empty fallback', () => {
    const model = buildSocialModel({}, { analysisDate: today })

    expect(JSON.stringify(model)).not.toMatch(/\bundefined\b|NaN|Infinity|\[object Object\]/)
    expect(model.leaderboard.enabled).toBe(false)
  })
})
