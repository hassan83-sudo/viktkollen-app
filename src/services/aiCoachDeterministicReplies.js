function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return value
  }

  const number = Number(String(value || '').replace(',', '.'))

  return Number.isFinite(number) ? number : null
}

function formatKg(value) {
  return `${value.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })} kg`
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

function pickTemplate(templates, seed) {
  const index = String(seed || '')
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0) % templates.length

  return templates[index]
}

function getCurrentWeight(context) {
  return parseNumber(context.weight?.currentWeight)
}

function getGoalWeight(context) {
  return parseNumber(context.profile?.goalWeight)
}

function makeWeightProgressText(changeSinceStart) {
  if (!Number.isFinite(changeSinceStart)) {
    return ''
  }

  if (changeSinceStart < 0) {
    return ` Du har gått ner ${formatKg(Math.abs(changeSinceStart))} sedan start.`
  }

  if (changeSinceStart > 0) {
    return ` Du ligger ${formatKg(changeSinceStart)} över startvikten.`
  }

  return ' Du ligger på samma vikt som start.'
}

function makeGoalDistanceText(currentWeight, goalWeight) {
  if (!Number.isFinite(currentWeight) || !Number.isFinite(goalWeight)) {
    return ''
  }

  const distanceToGoal = Number((currentWeight - goalWeight).toFixed(1))

  if (distanceToGoal === 0) {
    return ' Du är på din registrerade målvikt.'
  }

  return distanceToGoal > 0
    ? ` Det är ${formatKg(distanceToGoal)} kvar till ditt mål.`
    : ` Du ligger ${formatKg(Math.abs(distanceToGoal))} under ditt registrerade mål.`
}

function isCurrentWeightQuestion(text) {
  return includesAny(text, [
    'hur mycket väger jag',
    'vad väger jag',
    'min vikt',
    'vikt nu',
    'vikt idag',
    'vikt i dag',
  ])
}

function isWeightLossQuestion(text) {
  return includesAny(text, [
    'hur mycket har jag gått ner',
    'hur mycket har jag gått ned',
    'gått ner',
    'gått ned',
    'minskat i vikt',
    'viktförändring',
  ])
}

function isGoalDistanceQuestion(text) {
  return includesAny(text, [
    'hur mycket är kvar till mål',
    'hur mycket kvar till mål',
    'kvar till mål',
    'kvar till min målvikt',
    'till mål',
  ])
}

function isGoalWeightQuestion(text) {
  return includesAny(text, [
    'vad är min målvikt',
    'min målvikt',
    'målvikten',
    'vilken målvikt',
  ])
}

function isProteinQuestion(text) {
  return includesAny(text, [
    'hur många gram protein',
    'hur mycket protein',
    'protein behöver jag',
    'proteinbehov',
    'gram protein',
  ])
}

function isDinnerQuestion(text) {
  return includesAny(text, [
    'vad ska jag äta ikväll',
    'vad ska jag äta i kväll',
    'middag ikväll',
    'middag i kväll',
    'vad blir det till middag',
  ])
}

function isStressStatement(text) {
  return includesAny(text, [
    'jag är stressad',
    'är stressad',
    'känner mig stressad',
    'mycket stress',
  ])
}

function isLateMealHarmQuestion(text) {
  const hasLateMeal = includesAny(text, [
    'äter precis innan jag sover',
    'äta precis innan jag sover',
    'äter innan jag sover',
    'äta innan jag sover',
    'nära läggdags',
    'innan läggdags',
    'sent på kvällen',
  ])
  const asksHarm = includesAny(text, ['skadligt', 'farligt', 'dåligt'])

  return hasLateMeal && asksHarm
}

function isEightHoursSleepQuestion(text) {
  return (
    includesAny(text, ['sova 8 timmar', 'sova åtta timmar', '8 timmars sömn']) ||
    (text.includes('8') && text.includes('sömn'))
  )
}

function makeCurrentWeightReply(context) {
  const currentWeight = getCurrentWeight(context)

  if (!Number.isFinite(currentWeight)) {
    return null
  }

  return `Du väger just nu ${formatKg(currentWeight)}.${makeWeightProgressText(
    context.weight?.changeSinceStart,
  )}${makeGoalDistanceText(currentWeight, getGoalWeight(context))}`
}

function makeWeightLossReply(context) {
  const change = context.weight?.changeSinceStart

  if (!Number.isFinite(change)) {
    return null
  }

  if (change < 0) {
    return `Du har gått ner ${formatKg(Math.abs(change))} sedan start.`
  }

  if (change > 0) {
    return `Du ligger ${formatKg(change)} över startvikten just nu.`
  }

  return 'Du ligger på samma vikt som start just nu.'
}

function makeGoalDistanceReply(context) {
  const currentWeight = getCurrentWeight(context)
  const goalWeight = getGoalWeight(context)

  if (!Number.isFinite(goalWeight)) {
    return 'Jag hittar ingen registrerad målvikt ännu. Lägg in en målvikt så kan jag räkna kvar till mål.'
  }

  if (!Number.isFinite(currentWeight)) {
    return `Din registrerade målvikt är ${formatKg(goalWeight)}. Jag saknar aktuell vikt för att räkna hur mycket som är kvar.`
  }

  return makeGoalDistanceText(currentWeight, goalWeight).trim()
}

function makeGoalWeightReply(context) {
  const goalWeight = getGoalWeight(context)

  return Number.isFinite(goalWeight)
    ? `Din registrerade målvikt är ${formatKg(goalWeight)}.`
    : 'Jag hittar ingen registrerad målvikt ännu.'
}

function makeProteinReply(context) {
  const currentWeight = getCurrentWeight(context)

  if (!Number.isFinite(currentWeight)) {
    return 'Ett enkelt riktmärke är protein i varje måltid. Lägg gärna in aktuell vikt om du vill att jag räknar gram per dag mer exakt.'
  }

  const lower = Math.round(currentWeight * 1.2)
  const upper = Math.round(currentWeight * 1.6)
  const templates = [
    `Med din senaste vikt blir ett rimligt riktmärke cirka ${lower}-${upper} g protein per dag. Fördela det gärna över 3-4 måltider.`,
    `Utifrån din senaste vikt kan du sikta på ungefär ${lower}-${upper} g protein per dag. Gör det enkelt: en proteinkälla i varje måltid.`,
  ]

  return pickTemplate(templates, currentWeight)
}

function makeDinnerReply(context, message) {
  const mealCount = context.meals?.loggedMealsToday?.length || 0
  const latestAnalysis = context.meals?.latestMealAnalysis?.analysis
  const proteinHint = latestAnalysis?.proteinStatus
    ? ` Senaste matanalysen: ${latestAnalysis.proteinStatus}.`
    : ''
  const baseText = mealCount > 0
    ? `Du har redan ${mealCount} måltid${mealCount === 1 ? '' : 'er'} loggad${mealCount === 1 ? '' : 'e'} idag.`
    : 'Du har ingen tydlig måltid loggad idag ännu.'
  const templates = [
    `${baseText}${proteinHint} Ikväll: välj protein + något grönt + en enkel bas, till exempel kyckling, potatis och frysta grönsaker.`,
    `${baseText}${proteinHint} En bra middag ikväll kan vara äggwrap med keso och grönsaker, eller linsgryta med ris.`,
  ]

  return pickTemplate(templates, message)
}

function makeStressReply(context, message) {
  const energy = Number(context.checkIn?.energy)
  const steps = Number(context.checkIn?.steps)
  const movementText = Number.isFinite(steps) && steps < 5000
    ? ' Om det känns okej kan 5-10 minuter lugn promenad hjälpa.'
    : ''
  const lowEnergyText = Number.isFinite(energy) && energy <= 4
    ? ' Eftersom energin verkar låg: sänk kraven resten av dagen.'
    : ''
  const templates = [
    `Jag fattar. Gör det mindre just nu: ta vatten, ät något enkelt om du behöver och välj en sak att släppa.${lowEnergyText}${movementText}`,
    `När stressen är hög är nästa bästa steg att förenkla. Välj en konkret sak: vatten, lugn andning i två minuter eller en enkel måltid.${lowEnergyText}${movementText}`,
  ]

  return pickTemplate(templates, message)
}

function makeLateMealHarmReply() {
  return 'För de flesta är det inte skadligt att äta nära läggdags. Det kan däremot påverka sömn, reflux, hungervanor eller göra det lättare att äta mer än man tänkt. Om du är hungrig sent, testa något lättare som yoghurt, ägg, keso eller en liten macka.'
}

function makeEightHoursSleepReply(context) {
  const energy = Number(context.checkIn?.energy)
  const energyHint = Number.isFinite(energy) && energy <= 4
    ? ' Eftersom din energi verkar låg kan sömnen vara extra värd att prioritera ikväll.'
    : ''

  return `Ja, 8 timmar är ett bra riktmärke för många vuxna. Det viktigaste är ändå regelbunden sömn och att du känner dig återhämtad dagen efter.${energyHint}`
}

/**
 * Creates deterministic answers for questions where app data or clear safety wording should win over OpenAI.
 *
 * @param {object} params
 * @param {object} params.context
 * @param {object} params.intent
 * @param {string} params.message
 * @returns {string | null}
 */
export function createDeterministicAiCoachReply({ context, intent, message }) {
  const text = normalizeText(message)

  if (isLateMealHarmQuestion(text)) {
    return makeLateMealHarmReply()
  }

  if (isCurrentWeightQuestion(text)) {
    return makeCurrentWeightReply(context)
  }

  if (isWeightLossQuestion(text)) {
    return makeWeightLossReply(context)
  }

  if (isGoalDistanceQuestion(text)) {
    return makeGoalDistanceReply(context)
  }

  if (isGoalWeightQuestion(text)) {
    return makeGoalWeightReply(context)
  }

  if (isProteinQuestion(text) || intent.intent === 'protein') {
    return makeProteinReply(context)
  }

  if (isDinnerQuestion(text)) {
    return makeDinnerReply(context, message)
  }

  if (isStressStatement(text)) {
    return makeStressReply(context, message)
  }

  if (isEightHoursSleepQuestion(text)) {
    return makeEightHoursSleepReply(context)
  }

  return null
}
