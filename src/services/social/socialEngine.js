import { buildAchievementSummary } from '../achievements/achievementEngine.js'
import { buildInsightsEngine } from '../insights/insightsEngine.js'
import { getLocalDateString } from '../localDate.js'
import { buildFriendModel } from './friendEngine.js'
import { buildOptInLeaderboard } from './leaderboardEngine.js'
import { buildPrivacyReadiness, normalizePrivacySettings } from './privacyEngine.js'
import { buildAchievementShare, buildWeeklySummaryShare } from './shareEngine.js'

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function countSharedItems(items = []) {
  return safeArray(items).filter((item) => ['shared', 'active', 'accepted'].includes(item.status || item.visibility)).length
}

export function buildSocialModel(data = {}, options = {}) {
  const analysisDate = getLocalDateString(options.analysisDate || data.today || new Date())
  const socialState = data.socialState || {}
  const privacy = normalizePrivacySettings(socialState.privacy)
  const friends = buildFriendModel(socialState, { analysisDate })
  const achievements = buildAchievementSummary(data, { analysisDate })
  const insights = buildInsightsEngine(data, { analysisDate, period: options.period || '7d' })
  const leaderboard = buildOptInLeaderboard(socialState, { privacy })
  const weeklyShare = buildWeeklySummaryShare({ ...data, socialState: { ...socialState, privacy } }, { analysisDate })
  const achievementShare = buildAchievementShare({ ...data, socialState: { ...socialState, privacy } }, { analysisDate })
  const sharedGoals = safeArray(socialState.sharedGoals)
  const sharedChallenges = safeArray(socialState.sharedChallenges)
  const progressShares = safeArray(socialState.progressShares)

  return {
    achievements,
    accountability: {
      partnerCount: friends.partnerCount,
      text: friends.partnerCount
        ? `${friends.partnerCount} accountability partner finns.`
        : 'Ingen accountability partner vald ännu.',
    },
    friends,
    insights: {
      consistency: insights.consistency,
      momentum: insights.momentum,
      score: insights.score,
    },
    leaderboard,
    privacy,
    privacyReadiness: buildPrivacyReadiness(privacy),
    sharing: {
      achievementPreview: achievementShare,
      progressShareCount: progressShares.length,
      sharedChallengeCount: countSharedItems(sharedChallenges),
      sharedGoalCount: countSharedItems(sharedGoals),
      weeklyPreview: weeklyShare,
    },
    summary: {
      friendCount: friends.activeFriendCount,
      leaderboardEnabled: leaderboard.enabled,
      pendingInviteCount: friends.pendingInviteCount,
      privacyLabel: buildPrivacyReadiness(privacy).label,
      sharedGoalCount: countSharedItems(sharedGoals),
    },
    today: analysisDate,
  }
}

export function buildSocialSummary(data = {}, options = {}) {
  const model = buildSocialModel(data, options)

  return {
    friendCount: model.summary.friendCount,
    leaderboardEnabled: model.summary.leaderboardEnabled,
    partnerCount: model.accountability.partnerCount,
    pendingInviteCount: model.summary.pendingInviteCount,
    privacyLabel: model.summary.privacyLabel,
    sharedChallengeCount: model.sharing.sharedChallengeCount,
    sharedGoalCount: model.summary.sharedGoalCount,
    sharingReady: model.sharing.weeklyPreview.allowed || model.sharing.achievementPreview.allowed,
  }
}
