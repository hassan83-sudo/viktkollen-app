const unsafePatterns = [
  /svält/i,
  /hoppa över (mat|måltid|frukost|lunch|middag)/i,
  /kompensera med träning/i,
  /överträning/i,
  /snabb viktminskning/i,
  /ras(a|ar)? i vikt/i,
  /skuld/i,
  /skam/i,
  /lat/i,
  /disciplin/i,
  /diagnos/i,
  /botar/i,
  /garanter/i,
  /rank/i,
  /leaderboard/i,
]

function definitionText(definition = {}) {
  return [
    definition.title,
    definition.description,
    definition.category,
    definition.safetyCategory,
    definition.rewardText,
  ].join(' ')
}

export function validateAchievementSafety(definition = {}) {
  const text = definitionText(definition)
  const blockedPattern = unsafePatterns.find((pattern) => pattern.test(text))

  if (blockedPattern) {
    return {
      ok: false,
      reason: 'Definitionen innehåller text eller regler som inte passar säker motivation.',
    }
  }

  if (definition.category === 'nutrition' && /calorie|kalori/i.test(text) && /low|låg|under/i.test(text)) {
    return { ok: false, reason: 'Achievement för låg kalorikonsumtion är blockerad.' }
  }

  if (definition.category === 'weightProgress' && /kg|viktminskning/i.test(text) && !/mål|delmål|progress/i.test(text)) {
    return { ok: false, reason: 'Viktachievement behöver vara kopplat till användarens eget mål.' }
  }

  if (Number(definition.xp) > 100) {
    return { ok: false, reason: 'XP per händelse hålls lågt för att undvika aggressiv gamification.' }
  }

  return { ok: true, reason: '' }
}

export function filterSafeDefinitions(definitions = []) {
  const ids = new Set()
  const blocked = []
  const safe = []

  definitions.forEach((definition) => {
    if (!definition?.id || ids.has(definition.id)) {
      blocked.push({ definition, reason: 'Definitionen saknar unikt id.' })
      return
    }
    ids.add(definition.id)
    const safety = validateAchievementSafety(definition)
    if (!safety.ok) {
      blocked.push({ definition, reason: safety.reason })
      return
    }
    safe.push(definition)
  })

  return { blocked, safe }
}

export function sanitizeMotivationalText(value, fallback = 'Fortsätt i en takt som känns hållbar.') {
  const text = String(value || fallback).replace(/\s+/g, ' ').trim()
  return unsafePatterns.some((pattern) => pattern.test(text)) ? fallback : text
}

export const achievementSafetyInternals = {
  unsafePatterns,
}
