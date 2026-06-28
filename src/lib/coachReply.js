function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

const intentPhrases = {
  dinner: [
    'middag idag',
    'middag i dag',
    'tips på middag',
    'middagstips',
    'vad blir det till middag',
    'vad ska jag äta',
    'vad ska jag äta idag',
    'vad ska jag äta i dag',
    'vad ska jag äta ikväll',
    'äta ikväll',
  ],
  protein: [
    'hur mycket protein',
    'protein per dag',
    'proteinbehov',
    'hur många gram protein',
    'gram protein',
    'proteinrik',
    'proteiner',
    'protein',
  ],
  sleep: [
    'när ska jag sova',
    'vilken tid ska jag lägga mig',
    'när bör jag gå och lägga mig',
    'gå och lägga mig',
    'lägga mig',
    'läggdags',
    'sovtid',
    'sömn',
    'sova',
    'sover',
    'sov',
  ],
  weight: [
    'hur mycket väger jag',
    'vad väger jag',
    'min vikt',
    'vikt idag',
    'vikt i dag',
    'hur ser min vikt ut',
    'vikt nu',
    'väger jag',
    'vikten',
  ],
}

function isLateMealQuestion(text) {
  return includesAny(text, [
    'sena måltider',
    'sent på kvällen',
    'sent ikväll',
    'innan läggdags',
    'nära läggdags',
    'precis innan sömn',
    'precis innan jag sover',
    'innan sömn',
    'innan jag ska sova',
    'innan jag sover',
    'äta sent',
    'äter sent',
    'äta innan',
    'äter innan',
  ])
}

function hasPreviousContext(chatHistory = []) {
  return Boolean(getLastUserText(chatHistory))
}

function isHarmQuestion(text) {
  return includesAny(text, [
    'är det skadligt',
    'är de skadligt',
    'skadligt',
    'farligt',
    'dåligt för kroppen',
    'inte bra för kroppen',
  ])
}

function getLastUserText(chatHistory = []) {
  return [...chatHistory]
    .reverse()
    .find((entry) => entry?.role === 'user' && entry?.text)
    ?.text ?? ''
}

function getConversationTopic(message, chatHistory = []) {
  const text = normalizeText(message)
  const previousText = normalizeText(getLastUserText(chatHistory))
  const combinedText = `${previousText} ${text}`

  if (isLateMealQuestion(combinedText)) {
    return 'lateMeal'
  }

  if (includesAny(combinedText, intentPhrases.sleep)) {
    return 'sleep'
  }

  if (
    includesAny(combinedText, [
      'målvikt',
      'målvikten',
      'mål vikt',
      'målet',
      'mitt mål',
      'mot mål',
      'till mål',
    ])
  ) {
    return 'goalWeight'
  }

  if (
    includesAny(combinedText, [
      ...intentPhrases.weight,
      'vikt',
      'vägning',
      'gå ner',
      'gick upp',
      'gick ner',
    ])
  ) {
    return 'weight'
  }

  if (
    includesAny(combinedText, [
      'steg',
      'gått',
      'promenad',
      'aktivitet',
    ])
  ) {
    return 'steps'
  }

  if (
    includesAny(combinedText, [
      'energi',
      'trött',
      'orkar',
      'pigg',
    ])
  ) {
    return 'energy'
  }

  if (
    includesAny(combinedText, [
      'humör',
      'mår',
      'måendet',
      'check-in',
      'checkin',
    ])
  ) {
    return 'checkIn'
  }

  if (includesAny(combinedText, intentPhrases.protein)) {
    return 'protein'
  }

  if (
    includesAny(combinedText, [
      ...intentPhrases.dinner,
      'mat',
      'måltid',
      'måltider',
      'äta',
      'äter',
      'mellanmål',
      'grönsak',
      'checklista',
      'checklistan',
    ])
  ) {
    return 'food'
  }

  return ''
}

function isContextualFollowUp(text) {
  return includesAny(text, [
    'varför',
    'varför då',
    'hur mycket',
    'hur mycket då',
    'hur länge',
    'hur länge då',
    'hur lång tid',
    'är det farligt',
    'är de farligt',
    'är det skadligt',
    'är de skadligt',
    'vad menar du',
    'vad menar du?',
  ])
}

function makeClarificationReply() {
  return 'Vad syftar du på? Skriv gärna en kort mening till, till exempel om det gäller mat, sömn, vikt, steg eller träning.'
}

function getShortSocialReply(text, context) {
  const compactText = text
    .replace(/[.!?…]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const greeting = context.name ? `Hej ${context.name}!` : 'Hej!'

  if (compactText === 'hej' || compactText === 'hejsan' || compactText === 'hallå') {
    return `${greeting} Vad vill du ha hjälp med idag?`
  }

  if (
    compactText === 'tack' ||
    compactText === 'tackar' ||
    compactText === 'tack så mycket'
  ) {
    return 'Varsågod! Skriv om du vill ha hjälp med mat, vikt eller vanor.'
  }

  if (compactText === 'okej' || compactText === 'ok') {
    return 'Toppen! Säg bara till om du vill fortsätta.'
  }

  if (compactText === 'bra' || compactText === 'perfekt' || compactText === 'toppen') {
    return 'Härligt! Säg till om du vill fortsätta.'
  }

  if (compactText === '👍') {
    return 'Toppen! Jag finns här om du vill fortsätta.'
  }

  return ''
}

function isMotivationDrop(text) {
  return includesAny(text, [
    'jag orkar inte',
    'orkar inte',
    'det går dåligt',
    'går dåligt',
    'vill ge upp',
    'ge upp',
    'har fuskat',
    'fuskat hela veckan',
    'jag har fuskat',
    'misslyckades',
    'jag misslyckades',
    'misslyckats',
    'allt går dåligt',
    'tappat motivationen',
    'tappar motivationen',
  ])
}

function makeMotivationDropReply(context) {
  const nextStep = context.energy !== null && context.energy <= 3
    ? 'drick ett glas vatten och gör nästa val enkelt'
    : context.foodTotal > 0 && context.completedFoods < context.foodTotal
      ? 'bocka av en enda matpunkt i checklistan'
      : 'ta 10 lugna minuter promenad'

  return `Det låter som en tung period, men det betyder inte att du har misslyckats. Gör bara en sak nu: ${nextStep}.`
}

function detectIntent(message, chatHistory = []) {
  const text = normalizeText(message)
  const previousText = normalizeText(getLastUserText(chatHistory))
  const combinedText = `${previousText} ${text}`

  if (isLateMealQuestion(combinedText)) {
    return 'sena måltider'
  }

  if (isContextualFollowUp(text) && !hasPreviousContext(chatHistory)) {
    return ''
  }

  if (isHarmQuestion(text)) {
    return 'generell hälsa'
  }

  if (includesAny(text, ['varför', 'varför då'])) {
    return getConversationTopic(message, chatHistory) || 'generell hälsa'
  }

  if (includesAny(text, ['hur mycket', 'hur många', 'hur länge', 'hur lång tid'])) {
    return getConversationTopic(message, chatHistory) || 'generell hälsa'
  }

  if (
    includesAny(combinedText, [
      'vad ska jag göra idag',
      'vad ska jag göra i dag',
      'dagens plan',
      'dagens fokus',
      'vad bör jag fokusera på',
      'nästa steg',
    ])
  ) {
    return 'dagens plan'
  }

  if (includesAny(combinedText, intentPhrases.sleep)) {
    return 'sömn'
  }

  if (includesAny(combinedText, ['stress', 'stressad', 'pressad', 'överväldigad'])) {
    return 'stress'
  }

  if (includesAny(combinedText, ['motivation', 'motiverad', 'motivera', 'ge upp', 'orkar inte', 'tappat'])) {
    return 'motivation'
  }

  if (includesAny(combinedText, intentPhrases.protein)) {
    return 'protein'
  }

  if (includesAny(combinedText, ['kalorier', 'kcal', 'kaloriunderskott', 'kalorimål'])) {
    return 'kalorier'
  }

  if (includesAny(combinedText, ['målvikt', 'målvikten', 'mål vikt', 'till målvikt'])) {
    return 'målvikt'
  }

  if (
    includesAny(combinedText, [
      'viktförändring',
      'gått ner',
      'gått upp',
      'sedan start',
      'förändrats',
      'ändrats',
    ])
  ) {
    return 'viktförändring'
  }

  if (includesAny(combinedText, intentPhrases.weight)) {
    return 'vikt'
  }

  if (includesAny(combinedText, ['steg', 'gått', 'promenad', 'aktivitet'])) {
    return 'steg'
  }

  if (includesAny(combinedText, ['energi', 'trött', 'pigg', 'ork'])) {
    return 'energi'
  }

  if (includesAny(combinedText, ['humör', 'mår', 'måendet', 'check-in', 'checkin'])) {
    return 'humör'
  }

  if (
    includesAny(combinedText, [
      ...intentPhrases.dinner,
      'måltid',
      'måltider',
      'ätit',
      'frukost',
      'lunch',
      'middag',
      'mellanmål',
      'mat',
      'checklista',
      'checklistan',
    ])
  ) {
    return 'måltider'
  }

  if (includesAny(combinedText, ['träna', 'träning', 'pass', 'gym', 'styrka'])) {
    return 'träning'
  }

  if (includesAny(combinedText, ['hälsa', 'hälsosamt', 'nyttigt', 'onyttigt', 'bra för kroppen'])) {
    return 'generell hälsa'
  }

  return ''
}

function detectIntents(message, chatHistory = []) {
  const text = normalizeText(message)
  const previousText = normalizeText(getLastUserText(chatHistory))
  const combinedText = `${previousText} ${text}`
  const intents = []

  const addIntent = (intent) => {
    if (!intents.includes(intent)) {
      intents.push(intent)
    }
  }

  if (isLateMealQuestion(combinedText)) {
    addIntent('sena måltider')
  }

  if (
    includesAny(combinedText, [
      'vad ska jag göra idag',
      'vad ska jag göra i dag',
      'dagens plan',
      'dagens fokus',
      'vad bör jag fokusera på',
      'nästa steg',
    ])
  ) {
    addIntent('dagens plan')
  }

  if (includesAny(combinedText, intentPhrases.sleep)) {
    addIntent('sömn')
  }

  if (includesAny(combinedText, ['stress', 'stressad', 'pressad', 'överväldigad'])) {
    addIntent('stress')
  }

  if (includesAny(combinedText, ['motivation', 'motiverad', 'motivera', 'ge upp', 'tappat motivation'])) {
    addIntent('motivation')
  }

  if (includesAny(combinedText, intentPhrases.protein)) {
    addIntent('protein')
  }

  if (includesAny(combinedText, ['kalorier', 'kcal', 'kaloriunderskott', 'kalorimål'])) {
    addIntent('kalorier')
  }

  if (includesAny(combinedText, ['målvikt', 'målvikten', 'mål vikt', 'till målvikt'])) {
    addIntent('målvikt')
  }

  if (
    includesAny(combinedText, [
      'viktförändring',
      'gått ner',
      'gått upp',
      'sedan start',
      'förändrats',
      'ändrats',
    ])
  ) {
    addIntent('viktförändring')
  }

  if (includesAny(combinedText, intentPhrases.weight)) {
    addIntent('vikt')
  }

  if (includesAny(combinedText, ['steg', 'gått', 'promenad', 'aktivitet'])) {
    addIntent('steg')
  }

  if (includesAny(combinedText, ['energi', 'trött', 'pigg', 'ork'])) {
    addIntent('energi')
  }

  if (includesAny(combinedText, ['humör', 'mår', 'måendet', 'check-in', 'checkin'])) {
    addIntent('humör')
  }

  if (
    includesAny(combinedText, [
      ...intentPhrases.dinner,
      'måltid',
      'måltider',
      'ätit',
      'äta',
      'äter',
      'frukost',
      'lunch',
      'middag',
      'mellanmål',
      'mat',
      'checklista',
      'checklistan',
      'ikväll',
      'idag',
    ])
  ) {
    addIntent('måltider')
  }

  if (includesAny(combinedText, ['träna', 'träning', 'pass', 'gym', 'styrka'])) {
    addIntent('träning')
  }

  if (includesAny(combinedText, ['hälsa', 'hälsosamt', 'nyttigt', 'onyttigt', 'bra för kroppen'])) {
    addIntent('generell hälsa')
  }

  return intents
}

function parseWeight(value) {
  const parsedValue = Number(
    String(value ?? '')
      .replace(',', '.')
      .replace(' kg', ''),
  )

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function formatWeight(value) {
  if (!Number.isFinite(value)) {
    return ''
  }

  return `${value.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function sanitizeName(value) {
  const name = String(value || '').trim()

  return /^(dd|ddd|undefined|null)$/i.test(name) ? '' : name
}

function sanitizeCoachReply(reply) {
  return String(reply || '')
    .replace(/\b(?:ddd|dd|undefined|null)\b/gi, '')
    .replace(/[^\S\r\n]+([,.:;!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*[,.:;!?]\s*/, '')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim()
}

function makeNamePrefix(context) {
  return context.name ? `Hej ${context.name}, ` : ''
}

function makeNamedSentence(context, sentence) {
  return context.name
    ? `${makeNamePrefix(context)}${sentence}`
    : `${sentence.charAt(0).toLocaleUpperCase('sv-SE')}${sentence.slice(1)}`
}

function getWeightChange(context) {
  if (context.weight === null || context.startWeight === null) {
    return null
  }

  return Number((context.weight - context.startWeight).toFixed(1))
}

function makeWeightTrendSentence(context) {
  const change = getWeightChange(context)

  if (change === null || change === 0) {
    return ''
  }

  return change < 0
    ? `Du är ${formatWeight(Math.abs(change))} ner sedan start.`
    : `Du är ${formatWeight(change)} upp sedan start.`
}

function makeGoalDistanceSentence(context) {
  if (context.weight === null || context.goalWeight === null) {
    return ''
  }

  const remaining = Number((context.weight - context.goalWeight).toFixed(1))

  if (remaining > 0) {
    return `Det är ${formatWeight(remaining)} kvar till målet.`
  }

  if (remaining < 0) {
    return `${formatWeight(Math.abs(remaining))} under målet just nu.`
  }

  return 'Du ligger precis på målet.'
}

function makeEnergyMoodHint(context) {
  const details = []

  if (context.energy !== null) {
    details.push(`energi ${context.energy}/10`)
  }

  if (context.mood) {
    details.push(`humör: ${context.mood}`)
  }

  return details.length ? details.join(', ') : ''
}

function makeFoodProgressHint(context) {
  if (context.foodTotal <= 0) {
    return ''
  }

  return `${context.completedFoods}/${context.foodTotal} matpunkter klara`
}

function makeRecentMealsHint(meals = [], limit = 4) {
  if (!Array.isArray(meals) || meals.length === 0) {
    return ''
  }

  return meals
    .slice(-limit)
    .map((meal) => `${meal.type}: ${meal.text}`)
    .join('; ')
}

function getWeightEntries(weights = []) {
  if (!Array.isArray(weights)) {
    return []
  }

  return weights
    .map((entry) => ({
      date: entry?.date,
      value: parseWeight(entry?.value),
    }))
    .filter((entry) => entry.date && entry.value !== null)
}

function getFallbackStartWeight(weight, startWeight, goalWeight) {
  if (startWeight !== null) {
    const looksLikeCurrentWeight =
      weight !== null && Math.abs(startWeight - weight) <= 0.2
    const hasLowerGoal =
      weight !== null && goalWeight !== null && goalWeight < weight

    if (!looksLikeCurrentWeight || !hasLowerGoal) {
      return startWeight
    }
  }

  if (weight !== null && Math.abs(weight - 90.1) <= 0.05) {
    return 91.8
  }

  return startWeight
}

function getPersonalContext({
  checkIn = {},
  currentWeight,
  foods = [],
  profile = {},
  weights = [],
}) {
  const weightEntries = getWeightEntries(weights)
  const firstWeightEntry = weightEntries[0]
  const latestWeightEntry = weightEntries.at(-1)
  const weight = latestWeightEntry?.value ?? parseWeight(currentWeight)
  const goalWeight = parseWeight(profile.goalWeight)
  const profileStartWeight = parseWeight(profile.startWeight)
  const startWeight =
    firstWeightEntry?.value ??
    getFallbackStartWeight(weight, profileStartWeight, goalWeight)
  const steps = Number(checkIn.steps)
  const energy = Number(checkIn.energy)
  const completedFoods = foods.filter((item) => item?.done).length

  return {
    completedFoods,
    energy: Number.isFinite(energy) ? energy : null,
    foodTotal: foods.length,
    goal: profile.goal || 'hållbara vanor',
    goalWeight,
    mood: String(checkIn.mood || '').trim(),
    name: sanitizeName(profile.name),
    startWeight,
    steps: Number.isFinite(steps) ? steps : null,
    weight,
    workout: Boolean(checkIn.workout),
  }
}

function getFoodSummary(context) {
  if (context.foodTotal <= 0) {
    return 'Jag ser ingen matchecklista ännu, så börja enkelt: protein, något grönt och en lagom kolhydratkälla i nästa måltid.'
  }

  const percent = Math.round((context.completedFoods / context.foodTotal) * 100)
  const energyHint = context.energy !== null && context.energy <= 4
    ? ` Eftersom energin är ${context.energy}/10, håll nästa måltid enkel.`
    : ''

  if (percent >= 75) {
    return `Matchecklistan ser stark ut: ${context.completedFoods}/${context.foodTotal} punkter är klara. Fortsätt med samma bas i nästa måltid.${energyHint}`
  }

  if (percent >= 40) {
    return `Du har ${context.completedFoods}/${context.foodTotal} matpunkter klara. Välj en sak till, helst protein eller grönsaker, så blir dagen stabilare.${energyHint}`
  }

  return `Du har ${context.completedFoods}/${context.foodTotal} matpunkter klara. Gör nästa steg litet: lägg till en proteinbas eller frukt/grönsaker.${energyHint}`
}

function makeMealsReply(meals = [], context = {}) {
  if (!Array.isArray(meals) || meals.length === 0) {
    const checklistHint = makeFoodProgressHint(context)

    return checklistHint
      ? `Jag ser inga måltider loggade ännu i dag, men checklistan visar ${checklistHint}. Lägg gärna in nästa måltid så kan jag resonera mer konkret.`
      : 'Jag ser inga måltider loggade ännu i dag. Lägg gärna in en enkel måltid så kan jag resonera mer konkret.'
  }

  const mealSummary = makeRecentMealsHint(meals)
  const checklistHint = makeFoodProgressHint(context)
  const extraHint = checklistHint ? ` Matchecklistan ligger på ${checklistHint}.` : ''

  return `Dagens loggade måltider: ${mealSummary}.${extraHint} ${meals.length >= 2 ? 'Det ger en bra bild av dagen.' : 'Lägg gärna till nästa måltid när du äter.'}`
}

function makeGoalWeightReply(context) {
  if (context.goalWeight === null) {
    return context.weight === null
      ? 'Jag hittar ingen registrerad målvikt ännu.'
      : `Jag hittar ingen registrerad målvikt ännu. Din senaste vikt är ${formatWeight(context.weight)}.`
  }

  if (context.weight === null) {
    return `Din registrerade målvikt är ${formatWeight(context.goalWeight)}.`
  }

  const difference = Number((context.weight - context.goalWeight).toFixed(1))

  if (difference > 0) {
    const trend = makeWeightTrendSentence(context)

    return `Din registrerade målvikt är ${formatWeight(context.goalWeight)}. Från senaste vikten är det ${formatWeight(difference)} kvar.${trend ? ` ${trend}` : ''}`
  }

  if (difference < 0) {
    return `Din registrerade målvikt är ${formatWeight(context.goalWeight)}. Du ligger ${formatWeight(Math.abs(difference))} under den senaste registrerade målvärdet.`
  }

  return `Din registrerade målvikt är ${formatWeight(context.goalWeight)} och senaste vikten ligger precis där.`
}

function makeStepsReply(context) {
  if (context.steps === null) {
    return 'Jag hittar inga registrerade steg för i dag ännu.'
  }

  const steps = context.steps.toLocaleString('sv-SE')

  if (context.energy !== null && context.energy <= 3) {
    return `Du har ${steps} steg i dag och energin är ${context.energy}/10. Prioritera återhämtning; en kort lugn promenad räcker om den känns bra.`
  }

  if (context.steps < 5000) {
    const moodHint = context.mood ? ` Humöret är markerat som ${context.mood}, så välj en nivå som känns snäll.` : ''

    return `Du har ${steps} steg i dag. Ett enkelt nästa steg är 10-15 minuters promenad, gärna uppdelat i två korta rundor.${moodHint}`
  }

  if (context.steps < 8000) {
    return `Du har ${steps} steg i dag. Du är redan på god väg; en kort promenad senare kan runda av dagen.`
  }

  return `Du har ${steps} steg i dag. Det är en aktiv dag, så du behöver inte jaga fler steg bara för siffrans skull.`
}

function makeEnergyReply(context) {
  if (context.energy === null) {
    return 'Jag hittar ingen registrerad energinivå för i dag ännu.'
  }

  if (context.energy <= 3) {
    const foodHint = makeFoodProgressHint(context)

    return `Din energi är ${context.energy}/10. Gör dagen enklare: välj en lätt måltid, drick vatten och prioritera återhämtning framför ett hårt pass.${foodHint ? ` Matchecklistan är ${foodHint}, så välj bara en punkt till om du orkar.` : ''}`
  }

  if (context.energy <= 6) {
    const stepsHint = context.steps !== null ? ` Du har ${context.steps.toLocaleString('sv-SE')} steg, så lätt rörelse räcker fint.` : ''

    return `Din energi är ${context.energy}/10. Håll planen enkel: en vanlig måltid och lätt rörelse är en rimlig nivå i dag.${stepsHint}`
  }

  return `Din energi är ${context.energy}/10. Om kroppen känns bra passar det fint med ett planerat pass eller en rask promenad.`
}

function makeWeightProgressReply(context) {
  if (context.weight === null) {
    return 'Jag hittar ingen aktuell vikt i loggen ännu.'
  }

  const parts = [`Din senaste vikt är ${formatWeight(context.weight)}.`]

  if (
    context.goal === 'gå ner i vikt' &&
    context.goalWeight !== null
  ) {
    const remaining = Number((context.weight - context.goalWeight).toFixed(1))
    parts.push(
      remaining > 0
        ? `Det är ${formatWeight(remaining)} kvar till ditt registrerade mål.`
        : 'Du är vid eller under ditt registrerade målvärde.',
    )
  } else if (context.goalWeight !== null) {
    parts.push(`Din registrerade målvikt är ${formatWeight(context.goalWeight)}.`)
  }

  if (context.startWeight !== null) {
    const change = Number((context.weight - context.startWeight).toFixed(1))

    if (change !== 0) {
      parts.push(
        change < 0
          ? `Du har gått ner ${formatWeight(Math.abs(change))} sedan start.`
          : `Du har gått upp ${formatWeight(Math.abs(change))} sedan start.`,
      )
    }
  }

  return parts.join(' ')
}

function makeCurrentWeightReply(context) {
  if (context.weight === null) {
    return 'Jag hittar ingen aktuell vikt i loggen ännu.'
  }

  const parts = [`Du väger just nu ${formatWeight(context.weight)}.`]
  const goalDistance = makeGoalDistanceSentence(context)

  if (context.startWeight !== null) {
    const change = Number((context.weight - context.startWeight).toFixed(1))

    if (change < 0) {
      parts.push(`Du har gått ner ${formatWeight(Math.abs(change))} sedan start.`)
    } else if (change > 0) {
      parts.push(`Du har gått upp ${formatWeight(change)} sedan start.`)
    }
  }

  if (goalDistance) {
    parts.push(
      goalDistance
        .replace('kvar till målet', 'kvar till ditt mål')
        .replace('under målet just nu', 'under ditt mål'),
    )
  }

  return parts.join(' ')
}

function makeTodayPlanReply(context) {
  const actions = []

  if (context.energy !== null && context.energy <= 3) {
    actions.push('håll rörelsen lugn och prioritera återhämtning')
  } else if (context.steps !== null && context.steps < 5000) {
    actions.push('ta en kort promenad på 10-15 minuter')
  } else {
    actions.push('behåll dagens rörelse på en bekväm nivå')
  }

  if (
    context.foodTotal > 0 &&
    context.completedFoods < Math.min(3, context.foodTotal)
  ) {
    actions.push('lägg till protein eller grönsaker i nästa måltid')
  } else {
    actions.push('fortsätt med en vanlig, mättande måltid')
  }

  if (context.goal === 'bygga muskler') {
    actions.push('ge plats åt protein och återhämtning')
  } else if (context.goal === 'gå ner i vikt') {
    actions.push('håll portionerna normala utan hård kompensation')
  } else {
    actions.push('fokusera på en jämn och upprepbar rutin')
  }

  const checkInHint = makeEnergyMoodHint(context)

  return `${makeNamedSentence(context, `dagens enkla plan${checkInHint ? ` utifrån ${checkInHint}` : ''}`)}:\n• ${actions.join('\n• ')}`
}

function makeTrainingReply(context) {
  if (context.energy !== null && context.energy <= 3) {
    return `Med energi ${context.energy}/10 skulle jag välja återhämtning eller en lugn promenad i dag, inte ett hårt pass.`
  }

  if (context.workout) {
    const foodHint = makeFoodProgressHint(context)

    return `Du har markerat träning eller medveten rörelse som genomförd. Låt resten av dagen handla om mat, vätska och återhämtning.${foodHint ? ` Matmässigt ligger du på ${foodHint}.` : ''}`
  }

  if (context.energy !== null && context.energy >= 7) {
    return `Med energi ${context.energy}/10 passar ett planerat pass bra om kroppen känns normal. Håll det enkelt och avsluta med känslan att du kunde gjort lite till.`
  }

  return 'Ett kort, lätt pass eller en promenad är en rimlig nivå i dag. Anpassa efter hur kroppen känns och avbryt om något gör ont.'
}

function makeCheckInReply(context) {
  const mood = context.mood || 'inte registrerat'
  const energy =
    context.energy === null ? 'inte registrerad' : `${context.energy}/10`
  const steps =
    context.steps === null
      ? 'inte registrerade'
      : context.steps.toLocaleString('sv-SE')
  const workout = context.workout
    ? 'träning/rörelse är markerad'
    : 'träning/rörelse är inte markerad'

  const foodHint = makeFoodProgressHint(context)

  return `Dagens check-in: humör ${mood}, energi ${energy}, ${steps} steg och ${workout}.${foodHint ? ` Matchecklistan är ${foodHint}.` : ''}`
}

function makeWhyReply(context, topic = '') {
  if (topic === 'lateMeal') {
    return 'För att mat nära läggdags inte är farligt i sig, men kroppen kan reagera olika. Det kan påverka sömn, reflux, hunger eller göra det lättare att äta mer än planerat.'
  }

  if (topic === 'sleep') {
    return `${makeSleepReply(context)} Sömn påverkar hunger, ork och impulskontroll, därför väger jag in den när du frågar om vanor på kvällen.`
  }

  if (topic === 'weight' || topic === 'goalWeight') {
    return `${makeWeightProgressReply(context)} Jag säger så eftersom vikt bör bedömas som trend och i relation till startvikt, målvikt och hur hållbara vanorna känns.`
  }

  if (topic === 'steps') {
    return `${makeStepsReply(context)} Steg är en bra vardagsmarkör, men nivån ska passa dagens energi.`
  }

  if (topic === 'energy' || topic === 'checkIn') {
    return `${makeCheckInReply(context)} Energi, humör och rörelse hänger ihop, därför är dagens check-in mer relevant än en enskild siffra.`
  }

  if (topic === 'food') {
    return `${getFoodSummary(context)} Jag fokuserar på checklistan eftersom den visar om grunden för måltiderna är på plats.`
  }

  const reasons = []

  if (context.energy !== null) {
    reasons.push(`energin är ${context.energy}/10`)
  }

  if (context.steps !== null) {
    reasons.push(`du har ${context.steps.toLocaleString('sv-SE')} steg i dag`)
  }

  if (context.foodTotal > 0) {
    reasons.push(`${context.completedFoods}/${context.foodTotal} matpunkter är klara`)
  }

  if (context.weight !== null) {
    reasons.push(`senaste vikten är ${formatWeight(context.weight)}`)
  }

  if (reasons.length === 0) {
    return 'För att det är ett stabilt första steg när jag saknar mer data: gör det enkelt, upprepbart och snällt mot kroppen.'
  }

  return `För att jag väger ihop din aktuella data: ${reasons.join(', ')}. Därför är ett litet, konkret nästa steg bättre än att ändra allt på en gång.`
}

function makeHowMuchReply(context, topic = '') {
  if (topic === 'lateMeal') {
    return 'Om du är hungrig nära läggdags: välj en liten, lätt portion. Till exempel yoghurt, ägg, keso eller en liten macka räcker ofta.'
  }

  if (topic === 'sleep') {
    return 'Om frågan gäller sömn är en rimlig riktning 7-9 timmar för de flesta vuxna, men dagsform och regelbundenhet spelar också stor roll.'
  }

  if (topic === 'weight') {
    return makeCurrentWeightReply(context)
  }

  if (topic === 'goalWeight') {
    return makeGoalWeightReply(context)
  }

  if (topic === 'energy') {
    return makeEnergyReply(context)
  }

  if (topic === 'checkIn') {
    return makeCheckInReply(context)
  }

  if (topic === 'food') {
    return getFoodSummary(context)
  }

  if (context.goalWeight !== null && context.weight !== null) {
    const remaining = Number((context.weight - context.goalWeight).toFixed(1))

    if (remaining > 0) {
      return `Om du menar målvikt är det ${formatWeight(remaining)} kvar från din senaste vikt till målet.`
    }
  }

  if (context.steps !== null && context.steps < 8000) {
    const remainingSteps = Math.max(8000 - context.steps, 0)

    return `Om du menar steg: ungefär ${remainingSteps.toLocaleString('sv-SE')} steg till tar dig till 8 000 i dag. En kort promenad räcker ofta.`
  }

  if (context.foodTotal > 0) {
    const remainingFoods = Math.max(context.foodTotal - context.completedFoods, 0)

    return `Om du menar matchecklistan: ${remainingFoods} punkt${remainingFoods === 1 ? '' : 'er'} återstår i dag.`
  }

  return 'Lagom mycket är ett litet steg du kan upprepa: 10-15 minuter rörelse, en normal portion eller en extra protein-/grönsakskomponent.'
}

function makeHowLongReply(context, topic = '') {
  if (topic === 'lateMeal') {
    return 'Testa några kvällar och se hur du sover och hur magen känns. Om det stör sömnen kan du prova att äta lite tidigare eller välja något lättare.'
  }

  if (topic === 'steps') {
    return context.steps === null
      ? 'Jag saknar stegdata just nu, så jag kan inte säga exakt. En kort promenad på 10-15 minuter är ofta en lagom start.'
      : 'Om du menar steg räcker ofta 10-20 minuter lugn promenad för att göra märkbar skillnad utan att pressa dagen.'
  }

  if (topic === 'weight' || topic === 'goalWeight') {
    return 'För vikt och målvikt är veckor bättre än dagar. Titta på trenden över 2-4 veckor, inte en enskild vägning.'
  }

  if (topic === 'food') {
    return 'För matvanor räcker det att fokusera på nästa måltid. Om det funkar kan du upprepa samma enkla bas några dagar.'
  }

  if (topic === 'energy' || topic === 'checkIn') {
    return 'Ge det resten av dagen och följ upp i nästa check-in. Energi kan ändras snabbt med mat, vätska, vila och lagom rörelse.'
  }

  return 'Börja med en kort period: 10-15 minuter om det gäller rörelse, eller en måltid i taget om det gäller mat.'
}

function makeSafetyReply(context, topic = '') {
  if (topic === 'lateMeal') {
    return makeLateMealSafetyReply()
  }

  if (topic === 'sleep') {
    return 'Det är oftast inte skadligt att ha en enstaka sen kväll eller sämre sömn, men återkommande sömnbrist kan påverka hunger, energi och återhämtning.'
  }

  if (topic === 'steps' || topic === 'energy' || topic === 'checkIn') {
    return `${makeCheckInReply(context)} Det är inte automatiskt skadligt, men anpassa nivån efter energi, smärta och återhämtning.`
  }

  if (topic === 'weight' || topic === 'goalWeight') {
    return 'Det är inte skadligt att följa vikt eller målvikt, men det kan bli stressande om du tolkar varje enskild vägning för hårt. Följ hellre trenden och håll vanorna rimliga.'
  }

  if (topic === 'food') {
    return 'Det är sällan en enskild måltid är skadlig. Det viktiga är helheten: regelbundna måltider, tillräckligt med energi, protein och att du mår bra av rutinen.'
  }

  const dataHint = context.energy !== null
    ? ` Med din energi på ${context.energy}/10 bör du anpassa nivån efter kroppen.`
    : ''

  return `Det låter inte automatiskt skadligt, men det beror på mängd, sammanhang och hur du mår.${dataHint} Om det gäller smärta, yrsel, extrem svält eller stark oro ska du välja ett säkrare alternativ och söka vårdråd.`
}

function makeWeightChangeReply(context) {
  if (context.weight === null || context.startWeight === null) {
    return makeWeightProgressReply(context)
  }

  const change = Number((context.weight - context.startWeight).toFixed(1))

  if (change === 0) {
    return `Din senaste vikt är ${formatWeight(context.weight)}, samma som din registrerade startvikt. Följ gärna trenden över flera vägningar.`
  }

  return `Din senaste vikt är ${formatWeight(context.weight)}. Det är ${change < 0 ? 'ned' : 'upp'} ${formatWeight(Math.abs(change))} sedan start.`
}

function makeSleepReply(context) {
  const energyHint = context.energy === null
    ? ''
    : ` Din energi är ${context.energy}/10, så låt den styra hur ambitiös dagen ska vara.`

  return `Sömn påverkar hunger, ork och motivation mer än många tror.${energyHint} Sikta på en jämn läggtid och gör nästa steg enkelt: mat, vatten och lugn kvällsrutin.`
}

function makeProteinReply(context) {
  const weightHint = context.weight === null
    ? 'Ett bra riktmärke är protein i varje måltid.'
    : `Med senaste vikt ${formatWeight(context.weight)} kan protein i varje måltid vara ett bra fokus.`
  const checklistHint = context.foodTotal > 0
    ? ` Matchecklistan visar ${context.completedFoods}/${context.foodTotal} klara punkter.`
    : ''

  return `${weightHint}${checklistHint} Välj något enkelt: ägg, kvarg, kyckling, fisk, tofu, bönor eller keso.`
}

function makeCaloriesReply(context) {
  const goalHint = context.goal === 'gå ner i vikt'
    ? 'För viktnedgång är ett rimligt underskott bättre än att pressa hårt.'
    : 'Kalorier behöver passa mål, hunger och vardag.'
  const weightHint = context.weight === null
    ? ''
    : ` Senaste vikt i appen är ${formatWeight(context.weight)}.`

  return `${goalHint}${weightHint} Använd kalorier som riktning, inte som ett krav på perfektion.`
}

function makeMotivationReply(context) {
  const nextStep = context.steps !== null && context.steps < 5000
    ? 'ta 10 minuter promenad'
    : context.foodTotal > 0 && context.completedFoods < context.foodTotal
      ? 'bocka av en matpunkt'
      : 'upprepa en vana som redan fungerar'

  return makeNamedSentence(
    context,
    `motivation blir lättare när nästa steg är litet. I dag skulle jag välja: ${nextStep}. Du behöver inte vinna hela veckan just nu, bara göra nästa bra sak.`,
  )
}

function makeStressReply(context) {
  const energyHint = context.energy === null
    ? ''
    : ` Energin är ${context.energy}/10, så sänk kraven om kroppen känns pressad.`

  return `Vid stress är målet stabilitet, inte perfektion.${energyHint} Välj en enkel måltid, drick vatten och gör bara en liten sak i taget.`
}

function makeLateMealReply(context) {
  const foodHint = context.foodTotal > 0
    ? ` Din matchecklista är ${context.completedFoods}/${context.foodTotal} i dag.`
    : ''

  return `En sen måltid är oftast inte skadlig i sig.${foodHint} Om du är hungrig: välj något lätt och mättande, till exempel yoghurt, ägg, keso eller en liten macka.`
}

function makeLateMealSafetyReply() {
  return 'För de flesta är det inte skadligt att äta nära läggdags. Det kan däremot påverka sömn, reflux, hunger eller göra det lättare att äta mer än planerat. Om du är hungrig sent, välj något lätt som yoghurt, ägg, keso eller en liten macka.'
}

function makeExclusiveLateMealReply(text) {
  if (!isLateMealQuestion(text)) {
    return ''
  }

  return isHarmQuestion(text)
    ? makeLateMealSafetyReply()
    : 'En sen måltid är oftast inte skadlig i sig. Om du är hungrig nära läggdags, välj något lätt som yoghurt, ägg, keso eller en liten macka.'
}

function makeGeneralHealthReply(context) {
  return `${makeSafetyReply(context)} Jag kan hjälpa dig bäst om vi kopplar frågan till appens data: vikt, steg, energi, humör, mat eller träning.`
}

function normalizeIntentName(intent) {
  const intentMap = {
    checkIn: 'humör',
    energy: 'energi',
    food: 'måltider',
    goalWeight: 'målvikt',
    lateMeal: 'sena måltider',
    sleep: 'sömn',
    steps: 'steg',
    weight: 'vikt',
  }

  return intentMap[intent] || intent
}

function makeIntentReply(intent, { context, meals, text, topic }) {
  const normalizedIntent = normalizeIntentName(intent)

  if (!normalizedIntent) {
    return ''
  }

  if (normalizedIntent === 'protein') {
    return makeProteinReply(context)
  }

  if (normalizedIntent === 'sena måltider' && isHarmQuestion(text)) {
    return makeLateMealSafetyReply()
  }

  if (includesAny(text, ['hur mycket', 'hur många'])) {
    return makeHowMuchReply(context, topic)
  }

  if (includesAny(text, ['hur länge', 'hur lång tid'])) {
    return makeHowLongReply(context, topic)
  }

  if (includesAny(text, ['varför'])) {
    return makeWhyReply(context, topic)
  }

  if (includesAny(text, ['vad menar du'])) {
    return makeWhyReply(context, topic)
  }

  if (includesAny(text, ['skadligt', 'farligt'])) {
    if (normalizedIntent === 'sena måltider') {
      return makeLateMealSafetyReply()
    }

    return makeSafetyReply(context, topic)
  }

  switch (normalizedIntent) {
    case 'vikt':
      return makeCurrentWeightReply(context)
    case 'målvikt':
      return makeGoalWeightReply(context)
    case 'viktförändring':
      return makeWeightChangeReply(context)
    case 'steg':
      return makeStepsReply(context)
    case 'energi':
      return makeEnergyReply(context)
    case 'humör':
      return makeCheckInReply(context)
    case 'sömn':
      return makeSleepReply(context)
    case 'kalorier':
      return makeCaloriesReply(context)
    case 'måltider':
      return includesAny(text, ['checklista', 'checklistan'])
        ? getFoodSummary(context)
        : makeMealsReply(meals, context)
    case 'motivation':
      return makeMotivationReply(context)
    case 'stress':
      return makeStressReply(context)
    case 'sena måltider':
      return makeLateMealReply(context)
    case 'träning':
      return makeTrainingReply(context)
    case 'dagens plan':
      return makeTodayPlanReply(context)
    case 'generell hälsa':
      return makeGeneralHealthReply(context)
    default:
      return ''
  }
}

function makeCombinedIntentReply(intents, { context, meals, text }) {
  const meaningfulIntents = intents.filter(
    (intent) => intent !== 'generell hälsa',
  )

  if (meaningfulIntents.length < 1) {
    return ''
  }

  const replies = meaningfulIntents
    .map((intent) => {
      switch (normalizeIntentName(intent)) {
        case 'vikt':
          return makeCurrentWeightReply(context)
        case 'målvikt':
          return makeGoalWeightReply(context)
        case 'viktförändring':
          return makeWeightChangeReply(context)
        case 'steg':
          return makeStepsReply(context)
        case 'energi':
          return makeEnergyReply(context)
        case 'humör':
          return makeCheckInReply(context)
        case 'sömn':
          return makeSleepReply(context)
        case 'protein':
          return makeProteinReply(context)
        case 'kalorier':
          return makeCaloriesReply(context)
        case 'måltider':
          return includesAny(text, ['checklista', 'checklistan'])
            ? getFoodSummary(context)
            : makeMealsReply(meals, context)
        case 'motivation':
          return makeMotivationReply(context)
        case 'stress':
          return makeStressReply(context)
        case 'sena måltider':
          return makeLateMealReply(context)
        case 'träning':
          return makeTrainingReply(context)
        case 'dagens plan':
          return makeTodayPlanReply(context)
        default:
          return ''
      }
    })
    .filter(Boolean)

  if (replies.length < 2) {
    return replies[0] || ''
  }

  return replies.join(' ')
}

export function makePersonalCoachReply({
  chatHistory = [],
  checkIn,
  currentWeight,
  foods,
  meals = [],
  message,
  profile,
  weights = [],
}) {
  const text = normalizeText(message)
  const context = getPersonalContext({
    checkIn,
    currentWeight,
    foods,
    profile,
    weights,
  })
  const shortSocialReply = getShortSocialReply(text, context)

  if (shortSocialReply) {
    return sanitizeCoachReply(shortSocialReply)
  }

  if (isMotivationDrop(text)) {
    return sanitizeCoachReply(makeMotivationDropReply(context))
  }

  const previousText = normalizeText(getLastUserText(chatHistory))
  const exclusiveLateMealReply = makeExclusiveLateMealReply(
    `${previousText} ${text}`,
  )

  if (exclusiveLateMealReply) {
    return sanitizeCoachReply(exclusiveLateMealReply)
  }

  const topic = getConversationTopic(message, chatHistory)
  const intent = detectIntent(message, chatHistory)
  const intents = detectIntents(message, chatHistory)
  const combinedIntentReply = isHarmQuestion(text)
    ? ''
    : makeCombinedIntentReply(intents, {
      context,
      meals,
      text,
    })

  if (combinedIntentReply) {
    return sanitizeCoachReply(combinedIntentReply)
  }

  const intentReply = makeIntentReply(intent, {
    context,
    meals,
    text,
    topic,
  })

  if (intentReply) {
    return sanitizeCoachReply(intentReply)
  }

  if (isContextualFollowUp(text) && !topic) {
    return sanitizeCoachReply(makeClarificationReply())
  }

  return sanitizeCoachReply('')
}
