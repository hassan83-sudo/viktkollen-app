export const aiSafetyBlockCodes = {
  diagnosis: 'diagnosis',
  extremeWeightLoss: 'extremeWeightLoss',
  guaranteedResult: 'guaranteedResult',
  html: 'html',
  medication: 'medication',
  overtraining: 'overtraining',
  shame: 'shame',
  skippedMeals: 'skippedMeals',
  starvation: 'starvation',
  unknownAction: 'unknownAction',
}

const blockedPatterns = [
  { code: aiSafetyBlockCodes.diagnosis, pattern: /\bdiagnos|diagnose|sjukdom|disease/i },
  { code: aiSafetyBlockCodes.medication, pattern: /sluta med medicin|stop taking medication|läkemedel|medicine|dosering/i },
  { code: aiSafetyBlockCodes.starvation, pattern: /svält|starv|under\s*800\s*kcal|extrem fasta/i },
  { code: aiSafetyBlockCodes.skippedMeals, pattern: /hoppa över (måltid|mat|frukost|lunch|middag)|skip (meals|breakfast|lunch|dinner)/i },
  { code: aiSafetyBlockCodes.overtraining, pattern: /träna varje dag utan vila|train every day without rest|överträning/i },
  { code: aiSafetyBlockCodes.extremeWeightLoss, pattern: /(gå ner|lose).{0,20}(\d{1,2})\s*kg.{0,20}(vecka|week)|snabb viktminskning|rapid weight loss/i },
  { code: aiSafetyBlockCodes.shame, pattern: /skäms|shame|dålig karaktär|lat|lazy|misslyckad/i },
  { code: aiSafetyBlockCodes.guaranteedResult, pattern: /garanterar|guaranteed|kommer säkert|100%/i },
  { code: aiSafetyBlockCodes.html, pattern: /<script|javascript:|<\/?[a-z][\s\S]*>/i },
]

const allowedActionTypes = ['goal', 'habit', 'reminder', 'weeklyFocus', 'none']

function collectText(value) {
  if (!value || typeof value !== 'object') return String(value || '')
  return [
    value.summary,
    value.rationale,
    value.safetyNote,
    ...(Array.isArray(value.limitations) ? value.limitations : []),
    ...(Array.isArray(value.recommendations)
      ? value.recommendations.flatMap((item) => [
          item.title,
          item.description,
          item.reason,
          ...(Array.isArray(item.sourceFacts) ? item.sourceFacts : []),
        ])
      : []),
  ].filter(Boolean).join(' ')
}

export function validateAiCoachSafety(value = {}) {
  const text = collectText(value)
  const errors = blockedPatterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ code }) => code)

  if (Array.isArray(value.recommendations) && value.recommendations.length > 3) {
    errors.push('tooManyRecommendations')
  }

  ;(value.recommendations || []).forEach((item) => {
    if (!allowedActionTypes.includes(item.suggestedActionType)) {
      errors.push(aiSafetyBlockCodes.unknownAction)
    }
  })

  return {
    blocked: errors.length > 0,
    errors: [...new Set(errors)],
    ok: errors.length === 0,
  }
}

export function makeRuleBasedFallbackResult(model, reason = 'Remote AI kunde inte användas säkert.') {
  return {
    errorCode: 'fallback',
    generatedAt: new Date().toISOString(),
    ok: true,
    providerType: 'ruleBased',
    reason,
    recommendations: (model?.recommendations || []).slice(0, 3),
    safetyNote: model?.safetyNote || 'Regelbaserad rekommendation från Viktkollens lokala coach.',
    summary: model?.summary?.todayFocus || 'Regelbaserad coach används.',
  }
}
