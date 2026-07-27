import {
  calculateProteinNeed,
  extractWeightFromText,
  formatKg,
} from '../healthCalculations.js'
import { getIntentSourceText } from './coachConversation.js'
import { buildAiCoachFacts, hasRecentAdvice } from './coachFacts.js'
import { identifyAiCoachIntents } from './coachIntentDetector.js'
import { hasUnsafeOutput, includesAny, normalizeAiCoachText } from './coachText.js'

function cleanReply(value) {
  const reply = String(value || '').replace(/\s+/g, ' ').trim()

  return hasUnsafeOutput(reply) ? '' : reply
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
    const range = Number.isFinite(facts.startWeight) && Number.isFinite(facts.latestWeight)
      ? ` Det är från ${formatKg(facts.startWeight)} till ${formatKg(facts.latestWeight)}.`
      : ''

    return `Du har gått ner ${formatKg(facts.weightLost)} sedan start.${range}`
  }

  if (facts.weightLost < 0) {
    return `Du ligger ${formatKg(Math.abs(facts.weightLost))} över startvikten just nu.`
  }

  return 'Du har gått ner 0 kg sedan start. Du ligger på samma vikt som start just nu.'
}

function makeWeightGainReply(facts) {
  if (!Number.isFinite(facts.weightLost)) {
    return 'Jag saknar tillräcklig viktdata för att avgöra om du gått upp.'
  }

  return facts.weightLost < 0
    ? `Du ligger ${formatKg(Math.abs(facts.weightLost))} över startvikten just nu. Titta på veckosnittet innan du drar för stora slutsatser.`
    : `Du ligger inte över startvikten; du har gått ner ${formatKg(facts.weightLost)} sedan start.`
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
    return `Du ligger ${formatKg(Math.abs(facts.goalRemaining))} under ditt mål på ${formatKg(facts.goalWeight)}.`
  }

  return 'Du är på din registrerade målvikt.'
}

function makePrognosisReply(facts) {
  return facts.weightPrognosis?.text ||
    'Jag vill inte göra en målprognos ännu eftersom viktdata är för begränsad eller ojämn. Logga några fler vikter så blir uppskattningen mer rimlig.'
}

function makePlateauReply(facts) {
  if (facts.weightPlateau) {
    return 'Vikten står ganska still just nu. Det kan vara normal variation; jämför veckosnitt och testa en liten justering i steg eller portionsstorlek.'
  }

  return 'Vikten kan hoppa upp och ner av vätska, salt, sömn och tajming. Titta hellre på flera vägningar än en enskild dag.'
}

function makeStepsReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const explicitSteps = normalized.searchable.match(/(\d{3,5})\s*steg/)
  const steps = explicitSteps ? Number(explicitSteps[1]) : facts.steps

  if (Number.isFinite(steps)) {
    const next = steps < 5000
      ? 'En promenad på 20–30 minuter skulle föra dig närmare en mer aktiv dag.'
      : 'Fortsätt sprida rörelsen över dagen så blir det lättare att upprepa.'

    return `Du har gått ${steps.toLocaleString('sv-SE')} steg idag. ${next}`
  }

  return 'Jag hittar inga steg för idag. Ett konkret mål kan vara en kort promenad efter nästa måltid.'
}

function makeProteinReply(facts, message) {
  const explicitWeight = extractWeightFromText(message)
  const proteinWeight = explicitWeight ?? facts.latestWeight
  const proteinNeed = calculateProteinNeed(proteinWeight)

  if (!proteinNeed) {
    return 'Ett vanligt riktmärke är cirka 1,2–1,6 g protein per kilo kroppsvikt per dag. Lägg in aktuell vikt om du vill att jag räknar gram.'
  }

  const prefix = explicitWeight
    ? `Vid ${formatKg(proteinWeight)}`
    : `Med din senaste vikt på ${formatKg(proteinWeight)}`
  const goalText = facts.proteinGoalLabel
    ? ` Ditt proteinmål i appen är ${facts.proteinGoalLabel}.`
    : ''

  return `${prefix} är cirka ${proteinNeed.lower}–${proteinNeed.upper} g protein per dag ett bra riktmärke.${goalText}`
}

function makeCaloriesReply(facts) {
  return facts.caloriesGoal
    ? `Ditt kalorimål i appen är cirka ${facts.caloriesGoal.toLocaleString('sv-SE')} kcal. Se det som riktning, inte som en exakt dom för varje måltid.`
    : 'Jag hittar inget kalorimål i appdata. Fokusera på mättande måltider med protein, grönsaker och lagom portion.'
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
      ? `Som vi var inne på tidigare kan pizza få plats. Nästa smarta steg är en vanlig måltid, gärna något proteinrikt och frukt eller grönsaker.${proteinGoalText}`
      : `En pizza förstör inte dina framsteg. Fortsätt som vanligt vid nästa måltid och välj gärna protein och grönsaker.${proteinGoalText}`
  }

  if (normalized.plain.includes('hamburgare')) {
    return `Hamburgare kan funka fint. Gör nästa val enkelt: vatten eller light-läsk, lägg gärna till grönsaker och låt pommes eller sås vara lagom mängd.${proteinGoalText}`
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

function makeCravingReply(facts) {
  const proteinText = facts.proteinGoalLabel
    ? ` Se om nästa måltid kan bidra till proteinmålet ${facts.proteinGoalLabel}.`
    : ''

  return `Sötsug och kvällssug blir ofta starkare när energi, sömn eller måltidsrytm svajar. Testa ett planerat mellanmål: kvarg, ägg, frukt eller en mindre smörgås.${proteinText}`
}

function makeOvereatingReply(facts) {
  const repeated = hasRecentAdvice(facts, ['reset', 'vanlig maltid'])
  const next = repeated
    ? 'Den här gången: välj bara nästa vanliga måltid och stäng dagen utan extra regler.'
    : 'Gör en enkel reset: vatten, nästa vanliga måltid och ingen hård kompensation.'

  return `Att äta för mycket ibland betyder inte att du förstört något. ${next}`
}

function makeLateMealReply() {
  return 'Att äta precis innan sömn är oftast inte farligt, men ett tungt kvällsmål kan störa sömn eller mage. Om du är hungrig sent, välj något lätt med protein, till exempel yoghurt, ägg, keso eller en liten smörgås.'
}

function makeHealthyLossReply() {
  return 'Hälsosam viktnedgång bygger på ett måttligt underskott, protein i måltiderna, grönsaker, vardagsrörelse och sömn. Sikta på vanor du kan upprepa varje vecka.'
}

function makeMealReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const mealCount = facts.todayMeals.length
  const mealHint = mealCount > 0
    ? `Du har ${mealCount} måltider loggade idag.`
    : 'Du har ingen tydlig måltid loggad idag ännu.'
  const dinner = normalized.plain.includes('frukost')
    ? 'Frukostförslag: havregryn med kvarg och bär, eller äggmacka med frukt.'
    : normalized.plain.includes('lunch')
      ? 'Lunchförslag: kyckling eller bönor med ris/potatis och grönsaker.'
      : 'Ikväll: välj protein, något grönt och en enkel bas, till exempel kyckling med potatis, äggwrap med keso eller linsgryta med ris.'

  return `${mealHint} ${dinner}`
}

function makeTrainingReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const stepsText = Number.isFinite(facts.steps)
    ? ` Du har ${facts.steps.toLocaleString('sv-SE')} steg i senaste check-in.`
    : ''
  const lowEnergyText = Number.isFinite(facts.energy) && facts.energy <= 4
    ? ' Eftersom energin är låg passar lugn intensitet bättre idag.'
    : ''

  if (includesAny(normalized.plain, ['vilodag', 'traningsvark', 'orkar inte trana'])) {
    return `Vilodag kan vara ett bra träningsbeslut, inte ett avbrott.${stepsText} Prioritera sömn, lätt rörelse och protein.`
  }

  if (includesAny(normalized.plain, ['hiit', 'lopning'])) {
    return `Löpning eller HIIT funkar bäst när kroppen känns pigg.${lowEnergyText || ' Kör kort och kontrollerat om du är osäker.'}${stepsText}`
  }

  if (includesAny(normalized.plain, ['gym', 'styrketraning'])) {
    return `På gymmet: välj 3–5 basövningar och lämna lite energi kvar. Protein efter passet hjälper återhämtningen.${lowEnergyText}`
  }

  if (includesAny(normalized.plain, ['promenad', 'cykling'])) {
    return `Promenad eller cykling är ett starkt val för kontinuitet.${stepsText} Sikta på en nivå som känns lätt att upprepa imorgon också.`
  }

  return `Välj träning efter dagsform.${stepsText}${lowEnergyText} Det viktigaste är att passet går att upprepa.`
}

function makeRestDayReply(facts, message) {
  return makeTrainingReply(facts, message)
}

function makeMotivationReply(facts) {
  const moodText = facts.mood ? ` Humöret är "${facts.mood}" i senaste check-in.` : ''
  const energyText = Number.isFinite(facts.energy) ? ` Energin är ${facts.energy}/10.` : ''
  const advice = hasRecentAdvice(facts, ['vatten', 'promenad'])
    ? ' Välj en ny liten reset: planera nästa vanliga måltid och stäng dagen utan kompensation.'
    : ' Gör en enkel reset: vatten, nästa vanliga måltid och en kort promenad om det känns okej.'

  return `En dålig dag betyder inte att du har tappat riktningen.${energyText}${moodText}${advice}`
}

function makeStressReply(facts) {
  const energyHint = Number.isFinite(facts.energy) && facts.energy <= 4
    ? ' Eftersom energin verkar låg: sänk kraven resten av dagen.'
    : ''
  const stepsHint = Number.isFinite(facts.steps) && facts.steps < 5000
    ? ' En lugn promenad på 5–10 minuter räcker om du vill få lite rörelse.'
    : ''

  return `Jag hör dig. Ta två lugna minuter, drick vatten och välj en enda liten sak som behöver bli gjord.${energyHint}${stepsHint}`
}

function makeSleepReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const match = normalized.searchable.match(/(?:sov|sovit|sover|sova)\s+(?:bara\s+)?(\d{1,2}|fem|sex|sju|åtta|atta)/)
  const wordHours = { atta: 8, fem: 5, sex: 6, sju: 7, åtta: 8 }
  const hours = match ? wordHours[match[1]] ?? Number(match[1]) : facts.sleepHours
  const hoursText = Number.isFinite(hours) ? ` ${hours} timmar är kort sömn för många.` : ''

  return `Sömn påverkar hunger, ork och återhämtning.${hoursText} Håll dagen enkel och sikta på en lugnare kväll.`
}

function makeInsightReply(facts) {
  const insight = facts.proactiveInsights[0]

  if (!insight) {
    return 'Jag hittar ingen stark extra insikt ännu. Fortsätt logga vikt, check-in och måltider så blir coachningen mer träffsäker.'
  }

  return `${insight.observation} Det kan betyda att ${insight.significance.toLocaleLowerCase('sv-SE')} Nästa steg: ${insight.nextStep}`
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

  if (['okej', 'ok', 'toppen', 'bra'].includes(normalized.plain)) {
    return 'Bra. Då tar vi nästa steg när du vill.'
  }

  return 'Hej. Vad vill du kolla först: vikt, mat, träning eller motivation?'
}

function makeClarifyReply(facts, message) {
  const previous = facts.latestCoachReply || ''
  const normalized = normalizeAiCoachText(message)

  if (normalized.plain.includes('ge ett exempel')) {
    return 'Ett konkret exempel: om kvällen blir rörig, välj kvarg med bär, två ägg eller en liten smörgås i stället för att hoppa mellan snacks.'
  }

  if (previous && normalizeAiCoachText(previous).plain.includes('pizza')) {
    return 'Jag menar att pizzan inte nollställer något. Det viktiga är nästa val: ät vanligt igen, lägg gärna till protein och grönsaker, och undvik att kompensera hårt.'
  }

  if (previous && normalizeAiCoachText(previous).plain.includes('protein')) {
    return `Jag menar att proteinmålet är ett dagsriktmärke, inte ett krav per måltid. Fördela det gärna över 3–4 måltider.${facts.proteinGoalLabel ? ` Ditt riktmärke är ${facts.proteinGoalLabel}.` : ''}`
  }

  if (previous) {
    return 'Jag menar: gör nästa steg mindre och mer konkret. Välj en sak du kan göra nu, inte hela planen på en gång.'
  }

  return 'Jag kan utveckla, men jag behöver veta vilket råd du menar. Skriv gärna en mening till.'
}

function makeSafetyReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const rawText = String(message || '').toLocaleLowerCase('sv-SE')
  const compact = normalized.compact

  if (
    /br.stsm.rta|sv.rt att andas|bröstsmärta|svårt att andas|brostsmarta|svart att andas/i.test(rawText) ||
    includesAny(normalized.searchable, ['bröstsmärta', 'svårt att andas', 'svimmar', 'kraftig yrsel']) ||
    includesAny(normalized.plain, ['brostsmarta', 'svart att andas', 'svimmar', 'kraftig yrsel']) ||
    includesAny(compact, ['brstsmrta', 'svrtattandas', 'brostsmarta', 'svartattandas'])
  ) {
    return 'Det här kan vara akut. Kontakta vården direkt eller ring 112 om symtomen är starka eller pågår nu.'
  }

  if (
    includesAny(normalized.searchable, ['sluta med läkemedel']) ||
    includesAny(normalized.plain, ['sluta med lakemedel'])
  ) {
    return 'Ändra eller sluta inte med receptbelagda läkemedel utan att prata med vården. Kontakta din läkare eller mottagning för en trygg plan.'
  }

  if (
    /kr.kas|kräkas|krakas|sv.lta|svälta|svalta|hets.t/i.test(rawText) ||
    includesAny(normalized.searchable, ['svälta', 'kräkas', 'hetsäter']) ||
    includesAny(normalized.plain, ['svalta', 'krakas', 'hetsater']) ||
    includesAny(compact, ['svalta', 'krkas', 'krakas', 'hetsater'])
  ) {
    return 'Jag vill inte hjälpa till med svält eller att kräkas efter mat. Prata med vården eller någon du litar på; du förtjänar stöd som är tryggt.'
  }

  return 'Det här låter som något där vårdkontakt är klokt. Jag kan ge allmänna råd, men inte bedöma eller diagnostisera symtom.'
}

function buildReplyForIntent(intent, facts, message) {
  const builders = {
    calories: makeCaloriesReply,
    clarify: makeClarifyReply,
    craving: makeCravingReply,
    food: makeFoodReply,
    goal: makeGoalReply,
    healthy_loss: makeHealthyLossReply,
    insight: makeInsightReply,
    late_meal: makeLateMealReply,
    loss: makeLossReply,
    meal: makeMealReply,
    motivation: makeMotivationReply,
    overeating: makeOvereatingReply,
    plateau: makePlateauReply,
    prognosis: makePrognosisReply,
    protein: makeProteinReply,
    rest_day: makeRestDayReply,
    safety: makeSafetyReply,
    sleep: makeSleepReply,
    smalltalk: makeSmalltalkReply,
    steps: makeStepsReply,
    stress: makeStressReply,
    training: makeTrainingReply,
    weight: makeWeightReply,
    weight_gain: makeWeightGainReply,
  }

  return cleanReply(builders[intent]?.(facts, message) || '')
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

function limitIntents(intents) {
  if (intents.includes('safety')) {
    return ['safety']
  }

  return intents.slice(0, 9)
}

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
  const replies = limitIntents(resolvedIntents).map((resolvedIntent) =>
    buildReplyForIntent(resolvedIntent, facts, sourceMessage),
  )

  return mergeReplies(replies) ||
    'Jag är med. Kan du skriva frågan lite mer konkret så svarar jag kort?'
}
