import { normalizeFriend } from './friendEngine.js'
import { normalizePrivacySettings } from './privacyEngine.js'

export const safeLeaderboardMetrics = ['consistency', 'achievementXp', 'checkInDays', 'sharedChallenges']

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function normalizeMetric(metric) {
  return safeLeaderboardMetrics.includes(metric) ? metric : 'consistency'
}

export function buildOptInLeaderboard(socialState = {}, options = {}) {
  const privacy = normalizePrivacySettings(socialState.privacy || options.privacy)
  const metric = normalizeMetric(options.metric || socialState.leaderboardMetric)

  if (!privacy.leaderboardOptIn) {
    return {
      enabled: false,
      entries: [],
      metric,
      reason: 'Leaderboard är avstängd tills användaren aktivt väljer det.',
    }
  }

  const entries = safeArray(socialState.leaderboardEntries)
    .map((entry) => {
      const friend = normalizeFriend(entry.friend || entry)
      if (!friend || friend.status !== 'accepted') return null

      return {
        displayName: friend.displayName,
        friendId: friend.id,
        metric,
        score: safeNumber(entry[metric] ?? entry.score),
      }
    })
    .filter(Boolean)
    .sort((first, second) => second.score - first.score)
    .slice(0, 10)

  return {
    enabled: true,
    entries,
    metric,
    reason: entries.length ? 'Opt-in leaderboard för trygg, icke-medicinsk data.' : 'Inga opt-in poster ännu.',
  }
}

export function validateLeaderboardMetric(metric) {
  const normalized = normalizeMetric(metric)

  return {
    ok: normalized === metric,
    metric: normalized,
    reason: normalized === metric ? '' : 'Endast säkra, icke-medicinska sociala mått kan jämföras.',
  }
}
