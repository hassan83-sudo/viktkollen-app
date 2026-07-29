import {
  calculateProteinNeed,
  extractWeightFromText,
  formatKg,
} from '../healthCalculations.js'
import {
  analyzeNutritionMessage,
  describeLatestMeal,
  describeMealByType,
  describeMealCount,
  describeMealMemory,
  describeMostProteinMeal,
  describeTodayMeals,
  formatApproxCalories,
  formatApproxGrams,
} from '../nutrition/nutritionEngine.js'
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

function makeCheckInReply(facts) {
  const parts = []

  if (Number.isFinite(facts.energy)) parts.push(`energi ${facts.energy}/10`)
  if (facts.mood) parts.push(`humör: ${facts.mood}`)
  if (Number.isFinite(facts.steps)) parts.push(`${facts.steps.toLocaleString('sv-SE')} steg`)

  return parts.length
    ? `Din senaste check-in visar ${parts.join(', ')}. Välj nästa steg efter dagsformen.`
    : 'Jag hittar ingen tydlig check-in för idag ännu.'
}

function makeTodayFoodReply(facts) {
  if (facts.todayMealTimeline?.mealCount) {
    return describeTodayMeals(facts.todayMealTimeline)
  }

  if (!facts.todayMeals.length) {
    return 'Jag hittar inga måltider loggade för idag ännu.'
  }

  const names = facts.todayMeals
    .map((meal) => meal.name || meal.text || meal.type || 'måltid')
    .join(', ')
  const proteinText = facts.todayProtein > 0
    ? ` Totalt synligt protein är cirka ${facts.todayProtein.toLocaleString('sv-SE')} g.`
    : ''
  const nutritionText = facts.todayNutrition?.mealCount
    ? ` Min uppskattning för dagen är ${formatApproxGrams(facts.todayNutrition.totals.protein)} protein och ${formatApproxCalories(facts.todayNutrition.totals.calories)}.`
    : ''

  return `Idag ser jag: ${names}.${proteinText}${nutritionText}`
}

function makeMealMemoryReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const timeline = facts.todayMealTimeline
  const memory = facts.todayMealMemory

  if (!timeline?.mealCount) {
    return 'Jag hittar inga måltider loggade för idag ännu.'
  }

  if (includesAny(normalized.plain, ['senaste maltid', 'senaste maten'])) {
    return describeLatestMeal(timeline)
  }

  if (includesAny(normalized.plain, ['hur manga maltider', 'antal maltider'])) {
    return describeMealCount(timeline)
  }

  if (includesAny(normalized.plain, ['mest protein', 'inneholl mest protein'])) {
    return describeMostProteinMeal(memory)
  }

  if (includesAny(normalized.plain, ['till lunch', 'lunchen'])) {
    return describeMealByType(timeline, 'lunch')
  }

  if (includesAny(normalized.plain, ['till frukost', 'frukosten'])) {
    return describeMealByType(timeline, 'frukost')
  }

  if (includesAny(normalized.plain, ['till middag', 'middagen'])) {
    return describeMealByType(timeline, 'middag')
  }

  if (includesAny(normalized.plain, ['till nattmal', 'nattmal'])) {
    return describeMealByType(timeline, 'nattmål')
  }

  if (includesAny(normalized.plain, ['jag idag', 'atit idag', 'at idag'])) {
    return describeTodayMeals(timeline)
  }

  return describeMealMemory(timeline, memory)
}

function makeWeeklyNutritionReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const report = facts.weeklyNutritionReport
  const summary = report?.summary

  if (!summary) {
    return 'Jag hittar ingen veckosummering för maten just nu.'
  }

  const incomplete = summary.registeredDays < 7
    ? ` Registreringen är ofullständig: ${summary.registeredDays} av 7 dagar har mat.`
    : ''

  if (includesAny(normalized.plain, ['genomsnittligt protein', 'genomsnittliga protein'])) {
    return `Protein låg i genomsnitt på cirka ${Math.round(summary.averages.proteinPerRegisteredDay).toLocaleString('sv-SE')} g per registrerad dag.${incomplete}`
  }

  if (includesAny(normalized.plain, ['proteinmalet', 'proteinmålet', 'nådde jag protein'])) {
    return `Proteinmålet nåddes ${summary.proteinGoalDays.toLocaleString('sv-SE')} dagar denna vecka.${incomplete}`
  }

  if (includesAny(normalized.plain, ['registrerade jag mat', 'registrerade dagar'])) {
    return `Du registrerade mat ${summary.registeredDays.toLocaleString('sv-SE')} av 7 dagar denna vecka.`
  }

  if (includesAny(normalized.plain, ['mest protein'])) {
    return summary.mostProteinDay
      ? `${summary.mostProteinDay.dayName} var dagen med mest protein, cirka ${Math.round(summary.mostProteinDay.totals.protein).toLocaleString('sv-SE')} g.${incomplete}`
      : 'Jag hittar ingen registrerad dag med protein denna vecka.'
  }

  if (includesAny(normalized.plain, ['flest kalorier', 'högst kalorier', 'hogst kalorier'])) {
    return summary.highestCalorieDay
      ? `${summary.highestCalorieDay.dayName} hade högst kalorier, cirka ${Math.round(summary.highestCalorieDay.totals.calories).toLocaleString('sv-SE')} kcal.${incomplete}`
      : 'Jag hittar ingen registrerad dag med kalorier denna vecka.'
  }

  if (includesAny(normalized.plain, ['skiljer sig', 'forra veckan', 'förra veckan', 'föregående vecka', 'foregaende vecka'])) {
    return report.comparison.hasComparison
      ? report.comparison.text.join(' ')
      : report.comparison.reasons.join(' ')
  }

  if (includesAny(normalized.plain, ['regelbundet', 'maltidstyp', 'måltidstyp'])) {
    const type = summary.patterns.mostCommonMealType?.type || 'ingen tydlig måltidstyp'

    return `${type} var vanligast registrerad. Snittet var cirka ${summary.averages.mealsPerRegisteredDay.toFixed(1).replace('.', ',')} måltider per registrerad dag.${incomplete}`
  }

  if (includesAny(normalized.plain, ['fokusera pa nasta vecka', 'fokusera på nästa vecka'])) {
    return report.focus.length
      ? report.focus.join(' ')
      : 'Fortsätt med samma lugna registrering nästa vecka och använd måltidsmallar där de sparar tid.'
  }

  return `Du registrerade mat under ${summary.registeredDays} av 7 dagar. På registrerade dagar låg protein på cirka ${Math.round(summary.averages.proteinPerRegisteredDay).toLocaleString('sv-SE')} g och kalorier på cirka ${Math.round(summary.averages.caloriesPerRegisteredDay).toLocaleString('sv-SE')} kcal i genomsnitt.${incomplete}`
}

function makeMonthlyNutritionReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const report = facts.monthlyNutritionReport
  const summary = report?.summary

  if (!summary) {
    return 'Jag hittar ingen månadsrapport för maten just nu.'
  }

  const incomplete = summary.registeredDays < summary.elapsedDays
    ? ` Registreringen är ofullständig: ${summary.registeredDays} av ${summary.elapsedDays} möjliga dagar har mat.`
    : ''

  if (includesAny(normalized.plain, ['genomsnittligt protein', 'genomsnittliga protein'])) {
    return `Protein låg i genomsnitt på cirka ${Math.round(summary.averages.proteinPerRegisteredDay).toLocaleString('sv-SE')} g per registrerad dag denna månad.${incomplete}`
  }

  if (includesAny(normalized.plain, ['proteinmalet', 'proteinmålet', 'nadde jag protein', 'nådde jag protein'])) {
    return `Proteinmålet nåddes ${summary.proteinGoalDays.toLocaleString('sv-SE')} dagar denna månad.${incomplete}`
  }

  if (includesAny(normalized.plain, ['registrerade jag mat', 'registrerade dagar'])) {
    return `Du registrerade mat ${summary.registeredDays.toLocaleString('sv-SE')} av ${summary.elapsedDays.toLocaleString('sv-SE')} möjliga dagar denna månad.`
  }

  if (includesAny(normalized.plain, ['vilken vecka', 'hogst protein', 'högst protein'])) {
    const week = [...summary.weeklyBreakdown]
      .filter((entry) => entry.registeredDays > 0)
      .sort((first, second) => second.proteinAverage - first.proteinAverage)[0]

    return week
      ? `Veckan ${week.startDate} till ${week.endDate} hade högst protein, cirka ${Math.round(week.proteinAverage).toLocaleString('sv-SE')} g per registrerad dag.${incomplete}`
      : 'Jag hittar ingen registrerad vecka med protein denna månad.'
  }

  if (includesAny(normalized.plain, ['vilken dag', 'mest protein'])) {
    return summary.mostProteinDay
      ? `${summary.mostProteinDay.date} var dagen med mest protein denna månad, cirka ${Math.round(summary.mostProteinDay.totals.protein).toLocaleString('sv-SE')} g.${incomplete}`
      : 'Jag hittar ingen registrerad dag med protein denna månad.'
  }

  if (includesAny(normalized.plain, ['skiljer sig', 'forra manaden', 'förra månaden', 'foregaende manad', 'föregående månad'])) {
    return report.comparison.hasComparison
      ? report.comparison.text.join(' ')
      : report.comparison.reasons.join(' ')
  }

  if (includesAny(normalized.plain, ['maltid at jag oftast', 'måltid åt jag oftast', 'vanligast', 'oftast'])) {
    const recurring = summary.patterns.recurringMeal
    const type = summary.patterns.mostCommonMealType

    if (recurring) return `Den återkommande måltiden var "${recurring.text}", registrerad ${recurring.count} gånger denna månad.${incomplete}`
    return `${type?.type || 'Ingen tydlig måltidstyp'} var vanligast registrerad denna månad.${incomplete}`
  }

  if (includesAny(normalized.plain, ['vikt', 'forandrades', 'förändrades'])) {
    return summary.weightRelation?.text || 'Jag hittar ingen giltig viktdata för månaden.'
  }

  if (includesAny(normalized.plain, ['nasta manad', 'nästa månad', 'fokus'])) {
    return summary.nextMonthFocus.length
      ? summary.nextMonthFocus.join(' ')
      : 'Fortsätt med samma lugna registrering nästa månad och använd måltidsmallar där de sparar tid.'
  }

  return `Denna månad registrerade du mat under ${summary.registeredDays} av ${summary.elapsedDays} möjliga dagar. På registrerade dagar låg protein på cirka ${Math.round(summary.averages.proteinPerRegisteredDay).toLocaleString('sv-SE')} g och kalorier på cirka ${Math.round(summary.averages.caloriesPerRegisteredDay).toLocaleString('sv-SE')} kcal i genomsnitt.${incomplete}`
}

function makeProteinReply(facts, message) {
  const explicitWeight = extractWeightFromText(message)
  const normalized = normalizeAiCoachText(message)
  const proteinWeight = explicitWeight ?? facts.latestWeight
  const proteinNeed = calculateProteinNeed(proteinWeight)
  const asksToday = !explicitWeight && includesAny(normalized.plain, ['idag', 'i dag', 'atit', 'fatt i mig'])
  const asksRemaining = includesAny(normalized.plain, ['protein kvar', 'protein har jag kvar', 'protein aterstar', 'protein återstår'])
  const mealType = includesAny(normalized.plain, ['lunch', 'lunchen'])
    ? 'lunch'
    : includesAny(normalized.plain, ['middag', 'middagen'])
      ? 'middag'
      : null
  const asksGoal = includesAny(normalized.plain, ['proteinmal', 'proteinmål', 'mitt proteinmal', 'mitt proteinmål'])
  const asksSource = includesAny(normalized.plain, ['hur sattes', 'varfor', 'varför', 'rimligt'])
  const asksSuggestion = includesAny(normalized.plain, ['foresla', 'föreslå', 'forslag', 'förslag'])
  const asksDistribution = includesAny(normalized.plain, ['fordela', 'fördela', 'fordelning', 'fördelning'])

  if (asksDistribution) {
    const plan = facts.proteinDistributionPlan

    if (!plan) {
      return 'Jag hittar inget sparat proteinmål att fördela idag. Du kan sätta ett mål i Kostmål, eller be mig föreslå ett generellt riktmärke.'
    }

    if (plan.achieved) {
      return plan.explanation
    }

    const targets = plan.targets.map((target) => `${target.label.toLocaleLowerCase('sv-SE')}: ${target.rangeText}`).join(', ')

    return `${plan.explanation} En enkel fördelning kan vara ${targets}. Se det som ett mjukt riktmärke.`
  }

  if (asksSuggestion && facts.suggestedProteinGoal) {
    return `${facts.suggestedProteinGoal.explanation} Rekommenderad punkt är ungefär ${facts.suggestedProteinGoal.recommendedGrams} g. Det är ett generellt förslag, inte ett krav.`
  }

  if (asksGoal && facts.proteinGoal) {
    const source = facts.proteinGoalSource === 'suggested'
      ? 'Det är ett förslag baserat på profil som du har valt.'
      : 'Det är ett manuellt mål.'

    if (asksSource) {
      return `Ditt proteinmål är ${facts.proteinGoalLabel}. ${source} Det bör ses som ett dagsriktmärke, inte en exakt regel per måltid.`
    }

    return `Ditt proteinmål är ${facts.proteinGoalLabel}. ${source}`
  }

  if (asksGoal && !facts.proteinGoal) {
    return facts.suggestedProteinGoal
      ? `Du har inget sparat proteinmål. ${facts.suggestedProteinGoal.explanation}`
      : 'Du har inget sparat proteinmål och jag saknar giltig vikt för ett rimligt förslag.'
  }

  if (mealType && facts.todayNutrition?.mealCount) {
    const meal = facts.todayNutrition.analyzedMeals.find((entry) => entry.analysis.mealType === mealType || normalizeAiCoachText(entry.text).plain.includes(mealType))

    if (meal) {
      const proteinText = meal.analysis.flags.proteinRich ? ' Den verkar proteinrik.' : ' Den verkar inte särskilt proteinrik, så komplettera gärna med en tydlig proteinkälla om du behöver mer mättnad.'

      return `${mealType[0].toLocaleUpperCase('sv-SE')}${mealType.slice(1)}: ${meal.text}. Jag uppskattar den till ${formatApproxGrams(meal.totals.protein)} protein och ${formatApproxCalories(meal.totals.calories)}.${proteinText}`
    }
  }

  if (asksToday || asksRemaining) {
    const summary = facts.todayNutrition

    if (!summary?.mealCount && facts.todayProtein <= 0) {
      return 'Jag hittar inte tillräckligt med loggad mat för att avgöra proteinintaget idag.'
    }

    const proteinText = formatApproxGrams(summary?.totals?.protein || facts.todayProtein)

    if (asksRemaining) {
      if (!summary?.proteinGoal) {
        return `Du har loggat ${proteinText} protein idag, men jag hittar inget proteinmål att jämföra med.`
      }

      return `Du har loggat ungefär ${proteinText} protein idag. Det är cirka ${summary.proteinPercent} % av proteinmålet ${summary.proteinGoal.label}, med ungefär ${summary.proteinRemaining.toLocaleString('sv-SE')} g kvar.`
    }

    if (summary?.proteinGoal) {
      return `Du har loggat ungefär ${proteinText} protein idag, cirka ${summary.proteinPercent} % av proteinmålet ${summary.proteinGoal.label}.`
    }

    return `Du har loggat ungefär ${proteinText} protein idag, men jag hittar inget proteinmål att jämföra med.`
  }

  if (includesAny(normalized.plain, ['tillrackligt', 'fatt i mig', 'fatt protein'])) {
    if (!facts.todayMeals.length || facts.todayProtein <= 0) {
      return 'Jag hittar inte tillräckligt med loggad mat för att avgöra proteinintaget idag.'
    }

    if (facts.proteinGoal) {
      return facts.todayProtein >= facts.proteinGoal
        ? `Du har loggat cirka ${facts.todayProtein.toLocaleString('sv-SE')} g protein idag, vilket når ditt proteinmål ${facts.proteinGoalLabel}.`
        : `Du har loggat cirka ${facts.todayProtein.toLocaleString('sv-SE')} g protein idag. Det är under ditt proteinmål ${facts.proteinGoalLabel}, så lägg gärna till en proteinkälla i nästa måltid.`
    }

    return `Du har loggat cirka ${facts.todayProtein.toLocaleString('sv-SE')} g protein idag, men jag hittar inget proteinmål att jämföra med.`
  }

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

function makeCaloriesReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const asksToday = includesAny(normalized.plain, ['idag', 'i dag', 'fatt i mig', 'ätit', 'atit'])
  const asksRemaining = includesAny(normalized.plain, ['kvar', 'aterstar', 'återstår'])
  const asksSource = includesAny(normalized.plain, ['hur sattes', 'varfor', 'varför'])
  const asksSuggestion = includesAny(normalized.plain, ['foresla', 'föreslå', 'forslag', 'förslag'])
  const summary = facts.todayNutrition

  if (asksSuggestion) {
    return facts.suggestedCalorieGoal?.suggestedGoal
      ? `${facts.suggestedCalorieGoal.explanation} Det är en försiktig uppskattning och inget mål sparas från chatten.`
      : facts.suggestedCalorieGoal?.explanation || 'Det finns inte tillräckligt med profiluppgifter för ett rimligt kaloriförslag.'
  }

  if (asksToday) {
    if (!summary?.mealCount) {
      return 'Jag hittar inga analyserbara måltider för idag ännu.'
    }

    const goalText = summary.caloriesGoal
      ? ` Det är ungefär ${summary.caloriesRemaining.toLocaleString('sv-SE')} kcal kvar till kalorimålet ${summary.caloriesGoal.toLocaleString('sv-SE')} kcal.`
      : ''

    return `Du har loggat ungefär ${formatApproxCalories(summary.totals.calories)} idag.${goalText}`
  }

  if (facts.caloriesGoal) {
    const source = facts.caloriesGoalSource === 'suggested'
      ? 'Det är ett förslag baserat på profil som du har valt.'
      : 'Det är ett manuellt mål.'
    const remaining = asksRemaining && summary?.caloriesGoal
      ? ` Du har ungefär ${summary.caloriesRemaining.toLocaleString('sv-SE')} kcal kvar idag.`
      : ''

    return asksSource
      ? `Ditt kalorimål är cirka ${facts.caloriesGoal.toLocaleString('sv-SE')} kcal. ${source} Det är en uppskattning att följa över tid, inte en medicinsk ordination.${remaining}`
      : `Ditt kalorimål i appen är cirka ${facts.caloriesGoal.toLocaleString('sv-SE')} kcal.${remaining} Se det som riktning, inte som en exakt dom för varje måltid.`
  }

  return facts.suggestedCalorieGoal?.explanation
    ? `Jag hittar inget sparat kalorimål. ${facts.suggestedCalorieGoal.explanation}`
    : 'Jag hittar inget kalorimål i appdata. Fokusera på mättande måltider med protein, grönsaker och lagom portion.'
}
function makeFoodReply(facts, message) {
  const normalized = normalizeAiCoachText(message)
  const nutrition = analyzeNutritionMessage(message, {
    proteinGoal: facts.proteinGoalLabel || facts.proteinGoal,
    repeatedPizza: hasRecentAdvice(facts, ['pizza', 'gronsaker']),
  })
  const recentMealText = facts.recentMeals.length
    ? ` Senaste loggade måltider: ${facts.recentMeals.join(', ')}.`
    : ''
  const proteinGoalText = facts.proteinGoalLabel
    ? ` Tänk på proteinmålet ${facts.proteinGoalLabel} över hela dagen.`
    : ''

  if (nutrition.advice) {
    return nutrition.advice
  }

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
  const summary = facts.todayNutrition

  if (includesAny(normalized.plain, ['forbattra dagens mat', 'förbättra dagens mat', 'dagens mat'])) {
    if (!summary?.mealCount) {
      return 'Jag hittar inga analyserbara måltider för idag ännu. Logga en måltid så kan jag ge ett mer träffsäkert förslag.'
    }

    const proteinHint = summary.proteinGoal && summary.proteinRemaining > 0
      ? ` Du har ungefär ${summary.proteinRemaining.toLocaleString('sv-SE')} g protein kvar till målet.`
      : ''
    const vegetableHint = summary.analyzedMeals.some((entry) => entry.analysis.flags.containsVegetables)
      ? ' Fortsätt gärna med grönsaker i någon måltid till.'
      : ' Lägg gärna till grönsaker i nästa måltid för mer volym och variation.'

    return `Dagens mat är uppskattad till ${formatApproxGrams(summary.totals.protein)} protein och ${formatApproxCalories(summary.totals.calories)}.${proteinHint}${vegetableHint}`
  }

  const requestedMealType = includesAny(normalized.plain, ['lunch', 'lunchen'])
    ? 'lunch'
    : includesAny(normalized.plain, ['middag', 'middagen'])
      ? 'middag'
      : includesAny(normalized.plain, ['frukost'])
        ? 'frukost'
        : null

  if (requestedMealType && summary?.mealCount && includesAny(normalized.plain, ['hur sag', 'hur såg', 'proteinrik', 'ut'])) {
    const meal = summary.analyzedMeals.find((entry) => entry.analysis.mealType === requestedMealType || normalizeAiCoachText(entry.text).plain.includes(requestedMealType))

    if (meal) {
      const quality = meal.analysis.flags.proteinRich
        ? ' Den verkar proteinrik.'
        : ' Den kan kompletteras med mer protein om du vill bli mättare.'

      return `${requestedMealType[0].toLocaleUpperCase('sv-SE')}${requestedMealType.slice(1)}: ${meal.text}. Uppskattningen är ${formatApproxGrams(meal.totals.protein)} protein och ${formatApproxCalories(meal.totals.calories)}.${quality}`
    }
  }

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

function makeFocusReply(facts) {
  const insight = facts.proactiveInsights[0]

  if (insight) {
    return `${insight.observation} Fokus idag: ${insight.nextStep}`
  }

  if (Number.isFinite(facts.steps) && facts.steps < 5000) {
    return `Fokus idag: rörelse. Du har ${facts.steps.toLocaleString('sv-SE')} steg, så en kort promenad är ett rimligt nästa steg.`
  }

  return 'Fokus idag: håll det enkelt med vanlig mat, lite rörelse och en rimlig kvällsrutin.'
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
  const previousPlain = normalizeAiCoachText(previous).plain

  if (normalized.plain.includes('ge ett exempel')) {
    if (previousPlain.includes('somn')) {
      return 'Ett konkret exempel för sömn: håll träningen lätt idag, ät en vanlig mättande middag och lägg undan mobilen lite tidigare ikväll.'
    }

    return 'Ett konkret exempel: om kvällen blir rörig, välj kvarg med bär, två ägg eller en liten smörgås i stället för att hoppa mellan snacks.'
  }

  if (previous && previousPlain.includes('pizza')) {
    return 'Jag menar att pizzan inte nollställer något. Det viktiga är nästa val: ät vanligt igen, lägg gärna till protein och grönsaker, och undvik att kompensera hårt.'
  }

  if (previous && previousPlain.includes('protein')) {
    return `Jag menar att proteinmålet är ett dagsriktmärke, inte ett krav per måltid. Fördela det gärna över 3–4 måltider.${facts.proteinGoalLabel ? ` Ditt riktmärke är ${facts.proteinGoalLabel}.` : ''}`
  }

  if (previous && previousPlain.includes('somn')) {
    return 'Jag menar att kort sömn ofta påverkar hunger, ork och återhämtning dagen efter. Ett konkret exempel är att hålla träningen lugnare och välja en enkel, mättande måltid i stället för att jaga perfekta val.'
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
    checkin: makeCheckInReply,
    clarify: makeClarifyReply,
    craving: makeCravingReply,
    food: makeFoodReply,
    focus: makeFocusReply,
    goal: makeGoalReply,
    healthy_loss: makeHealthyLossReply,
    insight: makeInsightReply,
    late_meal: makeLateMealReply,
    loss: makeLossReply,
    meal: makeMealReply,
    meal_memory: makeMealMemoryReply,
    motivation: makeMotivationReply,
    monthly_nutrition: makeMonthlyNutritionReply,
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
    today_food: makeTodayFoodReply,
    weekly_nutrition: makeWeeklyNutritionReply,
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
