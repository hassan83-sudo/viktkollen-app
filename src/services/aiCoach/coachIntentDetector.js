import { getIntentSourceText, isClarifyFollowUp } from './coachConversation.js'
import { addUnique, hasAnyTerm, includesAny, normalizeAiCoachText } from './coachText.js'

export const intentOrder = [
  'safety',
  'smalltalk',
  'weight',
  'loss',
  'weight_gain',
  'goal',
  'prognosis',
  'plateau',
  'steps',
  'protein',
  'calories',
  'food',
  'craving',
  'overeating',
  'late_meal',
  'healthy_loss',
  'meal',
  'training',
  'rest_day',
  'motivation',
  'stress',
  'sleep',
  'insight',
  'clarify',
]

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

function extractSleepHours(text) {
  const match = text.match(
    /(?:sov|sovit|sover|sova)\s+(?:bara\s+)?(\d{1,2}|fem|sex|sju|åtta|atta)(?:[,.]\d+)?\s*(?:tim|timmar|h)?/,
  )

  if (!match) {
    return null
  }

  const words = {
    atta: 8,
    fem: 5,
    sex: 6,
    sju: 7,
    åtta: 8,
  }

  return words[match[1]] ?? Number(match[1])
}

function isCurrentWeightQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket väger jag',
    'vad väger jag',
    'min vikt',
    'aktuell vikt',
    'vikt nu',
    'vikt idag',
    'vikt i dag',
    'går det bra med vikten',
  ], [
    'hur mycket vager jag',
    'vad vager jag',
    'min vikt',
    'aktuell vikt',
    'vikt nu',
    'gar det bra med vikten',
  ])
}

function isWeightLossQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket har jag gått ner',
    'hur mycket har jag gått ned',
    'gått ner',
    'gått ned',
    'minskat i vikt',
    'viktförändring',
  ], [
    'hur mycket har jag gatt ner',
    'gatt ner',
    'gatt ned',
    'minskat i vikt',
    'viktforandring',
  ])
}

function isWeightGainQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'har jag gått upp',
    'gått upp',
    'vikten hoppar upp',
  ], [
    'har jag gatt upp',
    'gatt upp',
    'vikten hoppar upp',
  ])
}

function isGoalQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'hur mycket är kvar till mitt mål',
    'hur långt har jag kvar',
    'hur mycket är kvar till mål',
    'kvar till mitt mål',
    'kvar till mål',
    'kvar till min målvikt',
  ], [
    'hur mycket ar kvar till mitt mal',
    'hur langt har jag kvar',
    'hur mycket ar kvar till mal',
    'kvar till mitt mal',
    'kvar till mal',
    'kvar till min malvikt',
  ])
}

function isPrognosisQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'när når jag målet',
    'prognos',
    'när är jag framme',
  ], [
    'nar nar jag malet',
    'prognos',
    'nar ar jag framme',
  ])
}

function isPlateauQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'varför står vikten still',
    'viktplatå',
    'platå',
    'vikten hoppar upp och ner',
    'inget händer',
  ], [
    'varfor star vikten still',
    'viktplata',
    'plata',
    'vikten hoppar upp och ner',
    'inget hander',
  ])
}

function isProteinQuestion(normalized, message) {
  return hasAnyTerm(normalized, [
    'hur många gram protein',
    'hur mycket protein',
    'protein behöver jag',
    'proteinbehov',
    'gram protein',
    'protein',
  ], [
    'hur manga gram protein',
    'hur mycket protein',
    'protein behover jag',
    'proteinbehov',
    'gram protein',
    'protein',
  ]) || /(\d{2,3}(?:[,.]\d+)?)\s*(?:kg|kilo)/i.test(message) && normalized.plain.includes('protein')
}

function isCaloriesQuestion(normalized) {
  return hasAnyTerm(normalized, ['kalorier', 'kalorimål', 'kcal'], ['kalorier', 'kalorimal', 'kcal'])
}

function isStressStatement(normalized) {
  return hasAnyTerm(normalized, [
    'jag är stressad',
    'är stressad',
    'känner mig stressad',
    'stressad',
    'mycket stress',
  ], [
    'jag ar stressad',
    'ar stressad',
    'kanner mig stressad',
    'stressad',
    'mycket stress',
  ])
}

function isMotivationStatement(normalized) {
  return hasAnyTerm(normalized, [
    'tappat motivationen',
    'ingen motivation',
    'vill ge upp',
    'misslyckades',
    'misslyckats',
    'dålig dag',
    'dålig vecka',
    'åt för mycket',
    'ätit för mycket',
    'orkar inte',
    'gav upp',
    'känner mig dålig',
    'det går för långsamt',
    'jag börjar om på måndag',
  ], [
    'tappat motivationen',
    'ingen motivation',
    'vill ge upp',
    'misslyckades',
    'misslyckats',
    'dalig dag',
    'dalig vecka',
    'at for mycket',
    'atit for mycket',
    'orkar inte',
    'gav upp',
    'kanner mig dalig',
    'det gar for langsamt',
    'jag borjar om pa mandag',
  ])
}

function isSleepStatement(normalized) {
  return extractSleepHours(normalized.searchable) !== null ||
    hasAnyTerm(normalized, [
      'sov dåligt',
      'sov lite',
      'trött',
      'vaknar på natten',
      'kan inte somna',
      'sömn påverkar vikten',
      'träna sent',
    ], [
      'sov daligt',
      'sov lite',
      'trott',
      'vaknar pa natten',
      'kan inte somna',
      'somn paverkar vikten',
      'trana sent',
    ])
}

function isLateMealQuestion(normalized) {
  const hasTiming = hasAnyTerm(normalized, [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan läggdags',
    'nära läggdags',
    'sent på kvällen',
    'äta sent',
    'äter sent',
    'mat före sömn',
    'mat före läggdags',
  ], [
    'precis innan jag sover',
    'precis innan jag skulle sova',
    'innan jag sover',
    'innan jag skulle sova',
    'innan laggdags',
    'nara laggdags',
    'sent pa kvallen',
    'ata sent',
    'ater sent',
    'mat fore somn',
    'mat fore laggdags',
  ])
  const hasFood = includesAny(normalized.plain, ['at', 'atit', 'ater', 'ata', 'mat', 'maltid'])

  return hasTiming && (hasFood || normalized.plain.includes('laggdags'))
}

function isHealthyWeightLossQuestion(normalized) {
  const asksLoss = hasAnyTerm(normalized, [
    'hur kan jag gå ner i vikt',
    'gå ner i vikt',
    'viktnedgång',
    'viktminskning',
  ], [
    'hur kan jag ga ner i vikt',
    'ga ner i vikt',
    'viktnedgang',
    'viktminskning',
  ])
  const asksHealthy = includesAny(normalized.plain, ['halsosamt', 'sunt', 'hallbart', 'sakert'])

  return asksLoss && (asksHealthy || normalized.plain.includes('hur kan jag ga ner i vikt'))
}

function isMealQuestion(normalized) {
  return hasAnyTerm(normalized, [
    'vad ska jag äta',
    'vad ska jag äta ikväll',
    'middag',
    'lunch',
    'frukost',
    'mellanmål',
    'portionsstorlek',
  ], [
    'vad ska jag ata',
    'vad ska jag ata ikvall',
    'middag',
    'lunch',
    'frukost',
    'mellanmal',
    'portionsstorlek',
  ])
}

function isFoodStatement(normalized) {
  return hasAnyTerm(normalized, [
    'jag åt',
    'jag har ätit',
    'jag syndade',
    'jag fuskade',
    'förstörde dieten',
    'jag är hungrig',
    'sötsugen',
    'kvällssug',
    ...foodTerms,
  ], [
    'jag at',
    'jag har atit',
    'jag syndade',
    'jag fuskade',
    'forstorde dieten',
    'jag ar hungrig',
    'sotsugen',
    'kvallssug',
    ...plainFoodTerms,
  ])
}

function isCraving(normalized) {
  return hasAnyTerm(normalized, ['sötsugen', 'kvällssug', 'hungrig'], ['sotsugen', 'kvallssug', 'hungrig'])
}

function isOvereating(normalized) {
  return hasAnyTerm(normalized, ['åt för mycket', 'ätit för mycket', 'syndade', 'fuskade', 'förstörde dieten'], ['at for mycket', 'atit for mycket', 'syndade', 'fuskade', 'forstorde dieten'])
}

function isTrainingStatement(normalized) {
  return hasAnyTerm(normalized, [
    'ska jag träna idag',
    'jag orkar inte träna',
    'behöver jag vilodag',
    'träningsvärk',
    'promenad',
    'löpning',
    'gym',
    'styrketräning',
    'vilodag',
    'hiit',
    'cykling',
    'för lite rörelse',
    'hur många steg',
  ], [
    'ska jag trana idag',
    'jag orkar inte trana',
    'behover jag vilodag',
    'traningsvark',
    'promenad',
    'lopning',
    'gym',
    'styrketraning',
    'vilodag',
    'hiit',
    'cykling',
    'for lite rorelse',
    'hur manga steg',
  ])
}

function isRestDay(normalized) {
  return hasAnyTerm(normalized, ['vilodag', 'träningsvärk', 'orkar inte träna'], ['vilodag', 'traningsvark', 'orkar inte trana'])
}

function isStepsQuestion(normalized) {
  return hasAnyTerm(normalized, ['hur många steg', 'bara gått', 'för lite rörelse', 'steg'], ['hur manga steg', 'bara gatt', 'for lite rorelse', 'steg'])
}

function isSmalltalk(normalized) {
  return [
    'hej',
    'hejsan',
    'halla',
    'hallå',
    'god morgon',
    'god kvall',
    'god kväll',
    'god natt',
    'tack',
    'tackar',
    'okej',
    'ok',
    'toppen',
    'bra',
    'hur mar du',
  ].some((phrase) => normalized.plain === phrase)
}

function isSafetyIntent(normalized) {
  return hasAnyTerm(normalized, [
    'svimning',
    'svimmar',
    'bröstsmärta',
    'svårt att andas',
    'kraftig yrsel',
    'snabb ofrivillig viktnedgång',
    'sluta med läkemedel',
    'svälta mig',
    'vill svälta',
    'kräkas efter mat',
    'vill kräkas',
    'hetsäter och kompenserar',
  ], [
    'svimning',
    'svimmar',
    'brostsmarta',
    'svart att andas',
    'kraftig yrsel',
    'snabb ofrivillig viktnedgang',
    'sluta med lakemedel',
    'svalta mig',
    'vill svalta',
    'krakas efter mat',
    'vill krakas',
    'hetsater och kompenserar',
  ])
}

export function identifyAiCoachIntents({ message, chatHistory = [] }) {
  const sourceText = getIntentSourceText(message, chatHistory)
  const normalized = normalizeAiCoachText(sourceText)
  const currentNormalized = normalizeAiCoachText(message)
  const intents = []

  if (normalized.compact.length > 0 && normalized.compact.length <= 2) {
    return ['unclear']
  }

  if (isSafetyIntent(normalized)) {
    addUnique(intents, 'safety')
  }

  if (isSmalltalk(currentNormalized)) {
    addUnique(intents, 'smalltalk')
  }

  if (isClarifyFollowUp(currentNormalized)) {
    addUnique(intents, 'clarify')
    return intentOrder.filter((intent) => intents.includes(intent))
  }

  if (isCurrentWeightQuestion(normalized)) addUnique(intents, 'weight')
  if (isWeightLossQuestion(normalized)) addUnique(intents, 'loss')
  if (isWeightGainQuestion(normalized)) addUnique(intents, 'weight_gain')
  if (isGoalQuestion(normalized)) addUnique(intents, 'goal')
  if (isPrognosisQuestion(normalized)) addUnique(intents, 'prognosis')
  if (isPlateauQuestion(normalized)) addUnique(intents, 'plateau')
  if (isStepsQuestion(normalized)) addUnique(intents, 'steps')
  if (isProteinQuestion(normalized, sourceText)) addUnique(intents, 'protein')
  if (isCaloriesQuestion(normalized)) addUnique(intents, 'calories')

  const hasLateMealIntent = isLateMealQuestion(normalized)

  if (isOvereating(normalized)) addUnique(intents, 'overeating')
  if (isCraving(normalized)) addUnique(intents, 'craving')
  if (isFoodStatement(normalized) && (!hasLateMealIntent || normalized.plain.includes('pizza'))) addUnique(intents, 'food')
  if (hasLateMealIntent) addUnique(intents, 'late_meal')
  if (isHealthyWeightLossQuestion(normalized)) addUnique(intents, 'healthy_loss')
  if (isMealQuestion(normalized)) addUnique(intents, 'meal')
  if (isRestDay(normalized)) addUnique(intents, 'rest_day')
  if (isTrainingStatement(normalized)) addUnique(intents, 'training')
  if (isMotivationStatement(normalized)) addUnique(intents, 'motivation')
  if (isStressStatement(normalized)) addUnique(intents, 'stress')
  if (isSleepStatement(normalized) && !intents.includes('late_meal')) addUnique(intents, 'sleep')

  if (normalized.plain.includes('insikt') || normalized.plain.includes('analys')) {
    addUnique(intents, 'insight')
  }

  return intentOrder.filter((intent) => intents.includes(intent))
}
