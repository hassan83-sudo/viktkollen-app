import {
  calculateProteinNeed,
  extractWeightFromText,
  formatKg,
  getUnifiedWeightFacts,
  parseWeightValue,
} from './healthCalculations.js'

const intentOrder = [
  'smalltalk',
  'weight',
  'loss',
  'goal',
  'protein',
  'food',
  'late_meal',
  'healthy_loss',
  'meal',
  'training',
  'motivation',
  'stress',
  'sleep',
  'clarify',
]

function normalizeSpacing(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeAiCoachText(value) {
  const text = normalizeSpacing(value)
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
  const searchable = text
    .replace(/[!?;:()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    compact: searchable.replace(/[^a-zåäö0-9]/gi, ''),
    plain: stripDiacritics(searchable),
    searchable,
    text,
  }
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

function addIntent(intents, intent) {
  if (!intents.includes(intent)) {
    intents.push(intent)
  }
}

function getLastUserMessage(chatHistory = []) {
  return [...(Array.isArray(chatHistory) ? chatHistory : [])]
    .reverse()
    .find((message) => message?.role === 'user' && message?.text)
    ?.text
}

function getLastAssistantMessage(chatHistory = []) {
  return [...(Array.isArray(chatHistory) ? chatHistory : [])]
    .reverse()
    .find((message) => message?.role === 'assistant' && message?.text)
    ?.text
}

function getRecentConversationText(chatHistory = [], limit = 10) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .slice(-limit)
    .map((message) => message?.text || '')
    .filter(Boolean)
    .join(' ')
}

function shouldUsePreviousContext(normalized) {
  return [
    'det',
    'och sen',
    'och sedan',
    'varfor',
    'varfor da',
    'hur da',
    'hur menar du',
    'kan du utveckla',
    'utveckla',
    'var det dumt',
    'var det daligt',
    'var det bra',
    'dumt',
  ].some((phrase) => normalized.plain === phrase)
}

function getIntentSourceText(message, chatHistory) {
  const normalized = normalizeAiCoachText(message)

  if (!shouldUsePreviousContext(normalized)) {
    return message
  }

  const previousText = getLastUserMessage(chatHistory) ||
    getRecentConversationText(chatHistory, 5)

  return previousText ? `${previousText} ${message}` : message
}

function isClarifyFollowUp(normalized) {
  return [
    'hur menar du',
    'varfor',
    'varfor da',
    'kan du utveckla',
    'utveckla',
    'hur da',
  ].some((phrase) => normalized.plain === phrase)
}

function extractSleepHours(text) {
  const match = text.match(
    /(?:sov|sovit|sover|sova)\s+(?:bara\s+)?(\d{1,2})(?:[,.]\d+)?\s*(?:tim|timmar|h)?/,
  )

  return match ? Number(match[1]) : null
}

function isCurrentWeightQuestion(normalized) {
  return includesAny(normalized.searchable, [
    'hur mycket väger jag',
    'vad väger jag',
    'min vikt nu',
    'vikt nu',
    'vikt idag',
    'vikt i dag',
  ]) || includesAny(normalized.plain, [
    'hur mycket vager jag',
    'vad vager jag',
  ])
}

function isWeightLossQuestion(normalized) {
  return includesAny(normalized.searchable, [
    'hur mycket har jag gått ner',
    'hur mycket har jag gått ned',
    'gått ner',
    'gått ned',
    'minskat i vikt',
    'viktförändring',
  ]) || includesAny(normalized.plain, [
    'hur mycket har jag gatt ner',
    'gatt ner',
    'gatt ned',
    'viktnedgang',
  ])
}

function isGoalQuestion(normalized) {
  return includesAny(normalized.searchable, [
    'hur mycket är kvar till mitt mål',
    'hur mycket är kvar till mål',
    'hur mycket kvar till mitt mål',
    'hur mycket kvar till mål',
    'kvar till mitt mål',
    'kvar till mål',
    'kvar till min målvikt',
  ]) || includesAny(normalized.plain, [
    'hur mycket ar kvar till mitt mal',
    'hur mycket ar kvar till mal',
    'kvar till mitt mal',
    'kvar till mal',
    'kvar till min malvikt',
  ])
}

function isProteinQuestion(normalized, message) {
  return includesAny(normalized.searchable, [
    'hur många gram protein',
    'hur mycket protein',
    'protein behöver jag',
    'proteinbehov',
    'gram protein',
  ]) || includesAny(normalized.plain, [
    'hur manga gram protein',
    'hur mycket protein',
    'protein behover jag',
  ]) || (extractWeightFromText(message) !== null && normalized.plain.includes('protein'))
}

function isStressStatement(normalized) {
  return includesAny(normalized.searchable, [
    'jag är stressad',
    'är stressad',
    'känner mig stressad',
    'stressad',
    'mycket stress',
  ]) || includesAny(normalized.plain, [
    'jag ar stressad',
    'ar stressad',
    'kanner mig stressad',
  ])
}

function isMotivationStatement(normalized) {
  return includesAny(normalized.searchable, [
    'tappat motivationen',
    'ingen motivation',
    'misslyckades',
    'misslyckats',
    'dålig dag',
    'dålig vecka',
    'åt för mycket',
    'ätit för mycket',
    'orkar inte',
    'gav upp',
    'känns hopplöst',
  ]) || includesAny(normalized.plain, [
    'tappat motivationen',
    'ingen motivation',
    'misslyckades',
    'misslyckats',
    'dalig dag',
    'dalig vecka',
    'at for mycket',
    'atit for mycket',
    'orkar inte',
    'gav upp',
    'kanns hopplost',
  ])
}

function isSleepStatement(normalized) {
  return extractSleepHours(normalized.searchable) !== null ||
    includesAny(normalized.searchable, ['sömn', 'sovit dåligt', 'sover dåligt']) ||
    includesAny(normalized.plain, ['somn', 'sovit daligt', 'sover daligt'])
}

function isLateMealQuestion(normalized) {
  const hasTiming = includesAny(normalized.searchable, [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan läggdags',
    'nära läggdags',
    'sent på kvällen',
    'äta sent',
    'äter sent',
  ]) || includesAny(normalized.plain, [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan laggdags',
    'nara laggdags',
    'sent pa kvallen',
    'ata sent',
    'ater sent',
  ])
  const hasFood = includesAny(normalized.plain, ['at', 'atit', 'ater', 'ata', 'mat', 'maltid'])

  return hasTiming && hasFood
}

function isHealthyWeightLossQuestion(normalized) {
  const asksLoss = includesAny(normalized.plain, [
    'hur kan jag ga ner i vikt',
    'ga ner i vikt',
    'viktnedgang',
    'viktminskning',
  ])
  const asksHealthy = includesAny(normalized.plain, [
    'halsosamt',
    'sunt',
    'hallbart',
    'sakert',
  ])

  return asksLoss && (
    asksHealthy ||
    normalized.plain.includes('hur kan jag ga ner i vikt')
  )
}

function isMealQuestion(normalized) {
  return includesAny(normalized.searchable, [
    'vad ska jag äta ikväll',
    'vad ska jag äta i kväll',
    'middag ikväll',
    'middag i kväll',
    'vad blir det till middag',
  ]) || includesAny(normalized.plain, [
    'vad ska jag ata ikvall',
    'vad ska jag ata i kvall',
    'middag ikvall',
    'middag i kvall',
  ])
}

const foodTerms = [
  'pizza',
  'hamburgare',
  'godis',
  'chips',
  'läsk',
  'kyckling',
  'ägg',
  'kvarg',
  'havregryn',
  'ris',
  'potatis',
]

const plainFoodTerms = [
  'pizza',
  'hamburgare',
  'godis',
  'chips',
  'lask',
  'kyckling',
  'agg',
  'kvarg',
  'havregryn',
  'ris',
  'potatis',
]

function isFoodStatement(normalized) {
  return includesAny(normalized.searchable, [
    'jag åt',
    'jag har ätit',
    'åt pizza',
    'pizza idag',
    'pizza i dag',
  ]) || includesAny(normalized.plain, [
    'jag at',
    'jag har atit',
    'at pizza',
    'pizza idag',
    'pizza i dag',
  ]) || includesAny(normalized.searchable, foodTerms) ||
    includesAny(normalized.plain, plainFoodTerms)
}

function isTrainingStatement(normalized) {
  return includesAny(normalized.searchable, [
    'promenad',
    'löpning',
    'gym',
    'styrketräning',
    'vilodag',
    'hiit',
    'cykling',
  ]) || includesAny(normalized.plain, [
    'promenad',
    'lopning',
    'gym',
    'styrketraning',
    'vilodag',
    'hiit',
    'cykling',
  ])
}

function isSmalltalk(normalized) {
  return [
    'hej',
    'hejsan',
    'god morgon',
    'god natt',
    'tack',
    'tackar',
    'okej',
    'ok',
    'toppen',
    'hur mar du',
  ].some((phrase) => normalized.plain === phrase)
}

export function identifyAiCoachIntents({ message, chatHistory = [] }) {
  const sourceText = getIntentSourceText(message, chatHistory)
  const normalized = normalizeAiCoachText(sourceText)
  const currentNormalized = normalizeAiCoachText(message)
  const intents = []

  if (normalized.compact.length > 0 && normalized.compact.length <= 2) {
    return ['unclear']
  }

  if (isSmalltalk(currentNormalized)) {
    addIntent(intents, 'smalltalk')
  }

  if (isClarifyFollowUp(currentNormalized)) {
    addIntent(intents, 'clarify')
    return intentOrder.filter((intent) => intents.includes(intent))
  }

  if (isCurrentWeightQuestion(normalized)) {
    addIntent(intents, 'weight')
  }

  if (isWeightLossQuestion(normalized)) {
    addIntent(intents, 'loss')
  }

  if (isGoalQuestion(normalized)) {
    addIntent(intents, 'goal')
  }

  if (isProteinQuestion(normalized, sourceText)) {
    addIntent(intents, 'protein')
  }

  const hasLateMealIntent = isLateMealQuestion(normalized)

  if (isFoodStatement(normalized) && (!hasLateMealIntent || normalized.plain.includes('pizza'))) {
    addIntent(intents, 'food')
  }

  if (hasLateMealIntent) {
    addIntent(intents, 'late_meal')
  }

  if (isHealthyWeightLossQuestion(normalized)) {
    addIntent(intents, 'healthy_loss')
  }

  if (isMealQuestion(normalized)) {
    addIntent(intents, 'meal')
  }

  if (isTrainingStatement(normalized)) {
    addIntent(intents, 'training')
  }

  if (isMotivationStatement(normalized)) {
    addIntent(intents, 'motivation')
  }

  if (isStressStatement(normalized)) {
    addIntent(intents, 'stress')
  }

  if (isSleepStatement(normalized) && !intents.includes('late_meal')) {
    addIntent(intents, 'sleep')
  }

  return intentOrder.filter((intent) => intents.includes(intent))
}

function toNumber(value) {
  return parseWeightValue(value)
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function getWeightEntryValue(entry) {
  return parseWeightValue(entry?.value ?? entry?.weight)
}

function getWeightEntryTime(entry) {
  const date = new Date(entry?.date || entry?.createdAt || 0)

  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function getSortedWeightValues(weights = []) {
  return (Array.isArray(weights) ? weights : [])
    .map((entry) => ({
      time: getWeightEntryTime(entry),
      value: getWeightEntryValue(entry),
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((first, second) => first.time - second.time)
}

function getWeightLossFacts({ currentWeight, profile = {}, weights = [] }) {
  const sortedWeights = getSortedWeightValues(weights)
  const latestWeight = firstNumber(currentWeight, sortedWeights.at(-1)?.value)
  const startWeight = firstNumber(profile.startWeight, sortedWeights[0]?.value)
  const weightLost = Number.isFinite(startWeight) && Number.isFinite(latestWeight)
    ? Number((startWeight - latestWeight).toFixed(1))
    : null

  return {
    latestWeight,
    startWeight,
    weightLost,
  }
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function getMealDate(meal) {
  return String(meal?.date || meal?.createdAt || '').slice(0, 10)
}

function getTodayMeals(meals = []) {
  const today = getTodayDateString()

  return (Array.isArray(meals) ? meals : []).filter((meal) => getMealDate(meal) === today)
}

function getRecentMeals(meals = []) {
  return (Array.isArray(meals) ? meals : [])
    .slice(-3)
    .map((meal) => meal?.name || meal?.text || meal?.type || '')
    .filter(Boolean)
}

function getLatestMealAnalysis(mealHistory = []) {
  return Array.isArray(mealHistory) ? mealHistory[0] || null : null
}

function getNumericGoal(goals = {}, key) {
  const value = Number(String(goals?.[key] ?? '').replace(',', '.'))

  return Number.isFinite(value) && value > 0 ? value : null
}

function getRecentAssistantTexts(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((message) => message?.role === 'assistant' && message?.text)
    .slice(-5)
    .map((message) => message.text)
}

function hasRecentAdvice(facts, terms) {
  const recentText = normalizeAiCoachText(facts.recentAssistantTexts.join(' ')).plain

  return terms.some((term) => recentText.includes(term))
}

export function buildAiCoachFacts(context = {}) {
  const nestedWeight = context.weight || {}
  const profile = context.profile || {}
  const goalSettings = context.progressGoalSettings || context.goalSettings || {}
  const weights = Array.isArray(context.weights) ? context.weights : nestedWeight.history || []
  const unifiedWeight = getUnifiedWeightFacts({
    currentWeight: firstNumber(context.currentWeight, nestedWeight.currentWeight),
    goalWeight: firstNumber(profile.goalWeight, nestedWeight.goalWeight, goalSettings.goalWeight, goalSettings.targetWeight),
    profile,
    startWeight: firstNumber(profile.startWeight, nestedWeight.startWeight),
    weights,
  })
  const latestWeight = firstNumber(unifiedWeight.currentWeight, nestedWeight.currentWeight)
  const startWeight = firstNumber(unifiedWeight.startWeight, nestedWeight.startWeight)
  const goalWeight = firstNumber(unifiedWeight.goalWeight, nestedWeight.goalWeight)
  const lossFacts = getWeightLossFacts({
    currentWeight: latestWeight,
    profile,
    weights,
  })
  const weightLost = lossFacts.weightLost
  const goalRemaining = unifiedWeight.goalRemaining
  const todayMeals = getTodayMeals(context.meals?.loggedMealsToday || context.meals || [])
  const todayCheckin = context.todayCheckin || context.checkIn || {}
  const proteinGoal = getNumericGoal(context.nutritionGoals, 'protein')
  const proteinNeed = calculateProteinNeed(latestWeight)

  return {
    latestWeight,
    startWeight: lossFacts.startWeight ?? startWeight,
    goalWeight,
    weightLost,
    goalRemaining,
    weightTrend: unifiedWeight.trend,
    todayMeals,
    recentMeals: getRecentMeals(context.meals?.loggedMealsToday || context.meals || []),
    todayCheckin,
    steps: Number.isFinite(Number(todayCheckin.steps)) ? Number(todayCheckin.steps) : null,
    energy: Number.isFinite(Number(todayCheckin.energy)) ? Number(todayCheckin.energy) : null,
    mood: todayCheckin.mood || '',
    proteinGoal: proteinGoal ?? null,
    proteinGoalLabel: proteinGoal
      ? `${proteinGoal} g`
      : proteinNeed
        ? `${proteinNeed.lower}-${proteinNeed.upper} g`
        : null,
    latestMealAnalysis: getLatestMealAnalysis(context.mealHistory || context.meals?.history),
    latestCoachReply: getLastAssistantMessage(context.chatHistory),
    recentAssistantTexts: getRecentAssistantTexts(context.chatHistory),
  }
}

function makeWeightReply(facts) {
  if (!Number.isFinite(facts.latestWeight)) {
    return 'Jag hittar ingen giltig vikt i loggen just nu.'
  }

  const trendText = facts.weightTrend && facts.weightTrend !== 'För lite data'
    ? ` Trenden är ${facts.weightTrend.toLocaleLowerCase('sv-SE')}.`
    : ''

  return `Din senaste registrerade vikt är ${formatKg(facts.latestWeight)}.${trendText}`
}

function makeLossReply(facts) {
  if (!Number.isFinite(facts.weightLost)) {
    return 'Jag saknar startvikt eller aktuell vikt för att räkna viktnedgång.'
  }

  if (facts.weightLost > 0) {
    return `Du har gått ner ${formatKg(facts.weightLost)} sedan start.`
  }

  if (facts.weightLost < 0) {
    return `Du ligger ${formatKg(Math.abs(facts.weightLost))} över startvikten just nu.`
  }

  return 'Du ligger på samma vikt som start just nu.'
}

function makeGoalReply(facts) {
  if (!Number.isFinite(facts.goalWeight)) {
    return 'Jag hittar ingen registrerad målvikt ännu. Lägg in en målvikt så kan jag räkna kvar till mål.'
  }

  if (!Number.isFinite(facts.latestWeight) || !Number.isFinite(facts.goalRemaining)) {
    return `Din registrerade målvikt är ${formatKg(facts.goalWeight)}. Jag saknar aktuell vikt för att räkna hur mycket som är kvar.`
  }

  if (facts.goalRemaining > 0) {
    return `Du har ${formatKg(facts.goalRemaining)} kvar till ditt mål på ${formatKg(facts.goalWeight)}.`
  }

  if (facts.goalRemaining < 0) {
    return `Du ligger ${formatKg(Math.abs(facts.goalRemaining))} under ditt mål.`
  }

  return 'Du är på din registrerade målvikt.'
}

function makeProteinReply(facts, message) {
  const explicitWeight = extractWeightFromText(message)
  const proteinWeight = explicitWeight ?? facts.latestWeight
  const proteinNeed = calculateProteinNeed(proteinWeight)

  if (!proteinNeed) {
    return 'Ett vanligt riktmärke är cirka 1,2-1,6 g protein per kilo kroppsvikt per dag. Lägg in aktuell vikt om du vill att jag räknar gram.'
  }

  const prefix = explicitWeight
    ? `Vid ${formatKg(proteinWeight)}`
    : `Med din senaste vikt på ${formatKg(proteinWeight)}`
  const goalText = facts.proteinGoal
    ? ` Ditt proteinmål i appen är ${facts.proteinGoalLabel}.`
    : ''

  return `${prefix} är cirka ${proteinNeed.lower}–${proteinNeed.upper} g protein per dag ett bra riktmärke.${goalText}`
}

function makeStressReply(facts) {
  const energyHint = Number.isFinite(facts.energy) && facts.energy <= 4
    ? ' Eftersom energin verkar låg: sänk kraven resten av dagen.'
    : ''
  const stepsHint = Number.isFinite(facts.steps) && facts.steps < 5000
    ? ' En lugn promenad på 5-10 minuter räcker om du vill få lite rörelse.'
    : ''

  return `Jag hör dig. Ta två lugna minuter, drick vatten och välj en enda liten sak som behöver bli gjord.${energyHint}${stepsHint}`
}

function makeSleepReply(facts, message) {
  const hours = extractSleepHours(normalizeAiCoachText(message).searchable)
  const hoursText = Number.isFinite(hours)
    ? ` ${hours} timmar är kort sömn för många.`
    : ''

  return `Sömn påverkar hunger, ork och återhämtning.${hoursText} Håll dagen enkel och sikta på en lugnare kväll.`
}

function makeLateMealReply() {
  return 'Att äta precis innan sömn är oftast inte farligt, men ett tungt kvällsmål kan störa sömn eller mage. Om du är hungrig sent, välj något lätt med protein, till exempel yoghurt, ägg, keso eller en liten smörgås.'
}

function makeHealthyLossReply() {
  return 'Hälsosam viktnedgång bygger på ett måttligt underskott, protein i måltiderna, grönsaker, vardagsrörelse och sömn. Sikta på vanor du kan upprepa varje vecka.'
}

function makeFoodReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const recentMealText = facts.recentMeals.length
    ? ` Senaste loggade måltider: ${facts.recentMeals.join(', ')}.`
    : ''
  const proteinGoalText = facts.proteinGoalLabel
    ? ` Tänk på proteinmålet ${facts.proteinGoalLabel} över hela dagen.`
    : ''

  if (normalized.plain.includes('pizza')) {
    return hasRecentAdvice(facts, ['pizza', 'gronsaker'])
      ? `Pizza kan absolut få plats. Nästa smarta steg är bara en vanlig måltid, gärna något proteinrikt och frukt eller grönsaker.${proteinGoalText}`
      : `En pizza förstör inte dina framsteg. Fortsätt som vanligt vid nästa måltid och välj gärna protein och grönsaker.${proteinGoalText}`
  }

  if (includesAny(normalized.plain, ['hamburgare'])) {
    return `Hamburgare kan funka fint. Gör nästa val enkelt: vatten eller light-läsk, lägg gärna till grönsaker och låt pommes/sås vara lagom mängd.${proteinGoalText}`
  }

  if (includesAny(normalized.plain, ['godis', 'chips', 'lask'])) {
    return `Godis, chips eller läsk är inte ett misslyckande. Bestäm en rimlig mängd, fortsätt sedan med vanlig mat så blodsocker och hunger blir stabilare.${recentMealText}`
  }

  if (includesAny(normalized.plain, ['kyckling', 'agg', 'kvarg'])) {
    return `Bra proteinkälla. Kyckling, ägg och kvarg hjälper mättnad och gör det lättare att nå proteinmålet.${proteinGoalText}`
  }

  if (includesAny(normalized.plain, ['havregryn', 'ris', 'potatis'])) {
    return `Havregryn, ris och potatis är bra baser. Kombinera med protein och något grönt så blir måltiden mer mättande och jämn.${proteinGoalText}`
  }

  return `En enskild måltid avgör inte dina framsteg. Fortsätt som vanligt vid nästa måltid och sikta på protein, grönsaker och en lagom portion.${recentMealText}`
}

function makeMealReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const pizzaHint = normalized.plain.includes('pizza')
    ? ' Pizzan idag är inget problem i sig; låt nästa måltid vara enkel och mättande.'
    : ''
  const mealCount = facts.todayMeals.length
  const mealHint = mealCount > 0
    ? `Du har ${mealCount} måltid${mealCount === 1 ? '' : 'er'} loggad${mealCount === 1 ? '' : 'e'} idag.`
    : 'Du har ingen tydlig måltid loggad idag ännu.'

  return `${mealHint}${pizzaHint} Ikväll: välj protein, något grönt och en enkel bas, till exempel kyckling med potatis och frysta grönsaker, äggwrap med keso eller linsgryta med ris.`
}

function makeTrainingReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const stepsText = Number.isFinite(facts.steps)
    ? ` Du har ${facts.steps.toLocaleString('sv-SE')} steg i senaste check-in.`
    : ''
  const lowEnergyText = Number.isFinite(facts.energy) && facts.energy <= 4
    ? ' Eftersom energin är låg passar lugn intensitet bättre idag.'
    : ''

  if (includesAny(normalized.plain, ['vilodag'])) {
    return `Vilodag kan vara ett bra träningsbeslut, inte ett avbrott.${stepsText} Prioritera sömn, lätt rörelse och protein.`
  }

  if (includesAny(normalized.plain, ['hiit', 'lopning'])) {
    return `Löpning eller HIIT funkar bäst när kroppen känns pigg.${lowEnergyText || ' Kör kort och kontrollerat om du är osäker.'}${stepsText}`
  }

  if (includesAny(normalized.plain, ['gym', 'styrketraning'])) {
    return `På gymmet: välj 3-5 basövningar och lämna lite energi kvar. Protein efter passet hjälper återhämtningen.${lowEnergyText}`
  }

  if (includesAny(normalized.plain, ['promenad', 'cykling'])) {
    return `Promenad eller cykling är ett starkt val för kontinuitet.${stepsText} Sikta på en nivå som känns lätt att upprepa imorgon också.`
  }

  return `Välj träning efter dagsform.${stepsText}${lowEnergyText} Det viktigaste är att passet går att upprepa.`
}

function makeMotivationReply(facts) {
  const moodText = facts.mood ? ` Du har humör "${facts.mood}" i senaste check-in.` : ''
  const energyText = Number.isFinite(facts.energy)
    ? ` Energin är ${facts.energy}/10.`
    : ''
  const advice = hasRecentAdvice(facts, ['vatten', 'promenad'])
    ? ' Välj en ny liten reset: planera nästa vanliga måltid och stäng dagen utan kompensation.'
    : ' Gör en enkel reset: vatten, nästa vanliga måltid och en kort promenad om det känns okej.'

  return `En dålig dag betyder inte att du har tappat riktningen.${energyText}${moodText}${advice}`
}

function makeSmalltalkReply(facts, message) {
  const normalized = normalizeAiCoachText(message)

  if (normalized.plain === 'tack' || normalized.plain === 'tackar') {
    return 'Varsågod. Jag håller mig kort och hjälper dig ta nästa rimliga steg.'
  }

  if (normalized.plain === 'god natt') {
    return 'God natt. Släpp dagen nu och sikta på en lugn start imorgon.'
  }

  if (normalized.plain === 'god morgon') {
    const energyText = Number.isFinite(facts.energy)
      ? ` Senaste energin var ${facts.energy}/10, så välj en start som matchar dagsformen.`
      : ''

    return `God morgon.${energyText} Vad vill du börja med idag: mat, vikt eller rörelse?`
  }

  if (normalized.plain === 'hur mar du') {
    return 'Jag är redo och fokuserad. Hur känns kroppen och energin för dig idag?'
  }

  if (normalized.plain === 'okej' || normalized.plain === 'ok' || normalized.plain === 'toppen') {
    return 'Bra. Då tar vi nästa steg när du vill.'
  }

  return 'Hej. Vad vill du kolla först: vikt, mat, träning eller motivation?'
}

function makeClarifyReply(facts) {
  const previous = facts.latestCoachReply || ''

  if (previous && normalizeAiCoachText(previous).plain.includes('pizza')) {
    return 'Jag menar att pizzan inte nollställer något. Det viktiga är nästa val: ät vanligt igen, lägg gärna till protein och grönsaker, och undvik att kompensera hårt.'
  }

  if (previous && normalizeAiCoachText(previous).plain.includes('protein')) {
    return `Jag menar att proteinmålet är ett dagsriktmärke, inte ett krav per måltid. Fördela det gärna över 3-4 måltider.${facts.proteinGoalLabel ? ` Ditt riktmärke är ${facts.proteinGoalLabel}.` : ''}`
  }

  if (previous) {
    return 'Jag menar: gör nästa steg mindre och mer konkret. Välj en sak du kan göra nu, inte hela planen på en gång.'
  }

  return 'Jag kan utveckla, men jag behöver veta vilket råd du menar. Skriv gärna en mening till.'
}

function buildReplyForIntent(intent, facts, message) {
  const builders = {
    clarify: makeClarifyReply,
    food: makeFoodReply,
    goal: makeGoalReply,
    healthy_loss: makeHealthyLossReply,
    late_meal: makeLateMealReply,
    loss: makeLossReply,
    meal: makeMealReply,
    motivation: makeMotivationReply,
    protein: makeProteinReply,
    sleep: makeSleepReply,
    smalltalk: makeSmalltalkReply,
    stress: makeStressReply,
    training: makeTrainingReply,
    weight: makeWeightReply,
  }

  return builders[intent]?.(facts, message) || null
}

function mergeReplies(replies) {
  const seen = new Set()

  return replies
    .filter(Boolean)
    .filter((reply) => {
      const key = normalizeAiCoachText(reply).plain

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
    .join('\n')
}

/**
 * Runs the deterministic AI coach message pipeline: normalize, identify all
 * intents, gather facts once, build one reply per intent, and merge.
 *
 * @param {object} params
 * @param {object} params.context
 * @param {object} [params.intent]
 * @param {string} params.message
 * @param {{role: string, text: string}[]} [params.chatHistory]
 * @returns {string}
 */
export function createDeterministicAiCoachReply({
  context = {},
  intent = {},
  message,
  chatHistory = [],
}) {
  const intents = identifyAiCoachIntents({ chatHistory, message })
  const sourceMessage = getIntentSourceText(message, chatHistory)

  if (intents.includes('unclear')) {
    return 'Jag hängde inte riktigt med. Kan du skriva lite mer?'
  }

  const resolvedIntents = intents.length > 0
    ? intents
    : intent.intent
      ? [intent.intent]
      : []

  if (resolvedIntents.length === 0) {
    return 'Jag är med. Vill du att vi fokuserar på mat, vikt, träning, sömn eller motivation just nu?'
  }

  const facts = buildAiCoachFacts({
    ...context,
    chatHistory: context.chatHistory || chatHistory,
  })
  const replies = resolvedIntents.map((resolvedIntent) =>
    buildReplyForIntent(resolvedIntent, facts, sourceMessage),
  )

  return mergeReplies(replies) ||
    'Jag är med. Kan du skriva frågan lite mer konkret så svarar jag kort?'
}
