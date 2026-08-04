import { buildAchievementSummary } from '../achievements/achievementEngine.js'
import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { getLocalDateString } from '../localDate.js'
import { anonymizeText, canShareVisibility, normalizePrivacySettings, sanitizeSharePayload } from './privacyEngine.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function hashText(value) {
  const text = String(value || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

export function createLocalShareToken(payload = {}, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString()
  const seed = `${createdAt}:${JSON.stringify(sanitizeSharePayload(payload)).slice(0, 800)}`

  return {
    createdAt,
    expiresAt: options.expiresAt || '',
    id: `share-${hashText(seed)}`,
    localOnly: true,
    token: `local-${hashText(seed)}-${hashText(createdAt)}`,
  }
}

export function buildSharePreview(data = {}, options = {}) {
  const privacy = normalizePrivacySettings(data.socialState?.privacy || options.privacy)
  const audience = options.audience || 'friend'
  const analysisDate = getLocalDateString(options.analysisDate || data.today || new Date())
  const insights = buildInsightsEngine(data, { analysisDate, period: options.period || '7d' })
  const achievements = buildAchievementSummary(data, { analysisDate })
  const weeklySummaryAllowed = canShareVisibility(privacy.weeklySummarySharing, audience)
  const achievementsAllowed = canShareVisibility(privacy.achievementSharing, audience)
  const progressAllowed = canShareVisibility(privacy.progressSharing, audience)
  const payload = sanitizeSharePayload({
    achievement: achievementsAllowed ? achievements.latestAchievementTitle : 'Privat',
    consistency: weeklySummaryAllowed ? insights.consistency : null,
    displayName: privacy.shareDisplayName,
    focus: weeklySummaryAllowed ? safeArray(insights.insights)[0]?.summary || 'Veckans underlag är begränsat.' : 'Privat',
    momentum: weeklySummaryAllowed ? insights.momentum : null,
    progress: progressAllowed ? safeArray(insights.improvementSignals)[0]?.text || 'Progress delas utan viktvärden.' : 'Privat',
    sharedAt: analysisDate,
  })
  const token = createLocalShareToken(payload, { createdAt: options.createdAt })

  return {
    allowed: weeklySummaryAllowed || achievementsAllowed || progressAllowed,
    audience,
    payload,
    previewText: anonymizeText([
      payload.displayName,
      payload.focus,
      payload.achievement,
    ].filter(Boolean).join(' · '), 'Privat delningspreview'),
    privacy,
    token,
  }
}

export function buildWeeklySummaryShare(data = {}, options = {}) {
  const preview = buildSharePreview(data, options)

  return {
    ...preview,
    type: 'weeklySummary',
  }
}

export function buildAchievementShare(data = {}, options = {}) {
  const preview = buildSharePreview(data, options)

  return {
    ...preview,
    type: 'achievement',
  }
}

export const shareEngineInternals = {
  hashText,
}
