// Recognise an explicit command, never a how-to question. No provider is needed for these destinations.
export function isDirectNavigationRequest(text) {
  return /^(?:(?:kan du|can you|please|por favor|puedes)\s+)?(?:ta mig till|öppna|visa mig|gå till|navigera till|skicka mig till|take me to|open|show me|go to|llévame al?|llevame al?|abre|abrir|افتح|خذني إلى|خذني الى|انتقل إلى)\s/iu.test(String(text).trim())
}

export function directHelpDestination(text) {
  if (!isDirectNavigationRequest(text)) return null
  const targets = [
    [/matscan|matskann|food scan|escáner de (?:alimentos|comida)|escanear comida|ماسح الطعام|مسح الطعام/iu, 'more.nutrition', 'nutrition', 'nutrition-scanner-v2'],
    [/inställning|settings|ajustes|إعدادات/iu, 'more.settings', 'installningar'],
    [/abonnemang|subscription|suscripción|اشتراك/iu, 'settings.plan', 'installningar'],
    [/ai.?coach|مدرب|entrenador/iu, 'more.coach', 'coach'],
  ]
  const matches = targets.filter(([pattern]) => pattern.test(text))
  if (matches.length !== 1) return null
  const [, id, sectionId, targetId] = matches[0]
  return { id, sectionId, targetId }
}
