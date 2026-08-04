const levelThresholds = [
  [1, 'Start', 0],
  [2, 'På väg', 100],
  [3, 'Stabil grund', 250],
  [4, 'God rutin', 500],
  [5, 'Långsiktig vana', 850],
]

export function calculateAchievementXp(achievements = [], ledger = {}) {
  const grantedIds = new Set((ledger?.xpLedger || []).map((event) => event.eventId || event.achievementId).filter(Boolean))
  const events = []
  let totalXp = 0

  achievements
    .filter((achievement) => ['unlocked', 'completed'].includes(achievement.status))
    .forEach((achievement) => {
      const eventId = `xp-${achievement.definitionId}`
      const xp = Math.max(0, Math.min(Number(achievement.xp) || 0, 80))
      if (!grantedIds.has(eventId)) {
        events.push({
          achievementId: achievement.id,
          definitionId: achievement.definitionId,
          eventId,
          source: achievement.source,
          type: 'xpGranted',
          xp,
        })
      }
      totalXp += xp
    })

  return {
    events,
    totalXp,
    ...calculateLevel(totalXp),
  }
}

export function calculateLevel(totalXp = 0) {
  const xp = Math.max(0, Math.round(Number(totalXp) || 0))
  const current = [...levelThresholds].reverse().find(([, , threshold]) => xp >= threshold) || levelThresholds[0]
  const next = levelThresholds.find(([, , threshold]) => threshold > xp)
  const currentThreshold = current[2]
  const nextThreshold = next?.[2] ?? currentThreshold
  const span = Math.max(1, nextThreshold - currentThreshold)

  return {
    currentXp: xp,
    level: current[0],
    nextLevelXp: nextThreshold,
    progressPercent: next ? Math.min(100, Math.round(((xp - currentThreshold) / span) * 100)) : 100,
    title: current[1],
  }
}

export const xpEngineInternals = {
  levelThresholds,
}
