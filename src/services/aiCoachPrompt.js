import { createDeterministicAiCoachReply } from './aiCoachDeterministicReplies.js'

const responseTemplates = {
  bodyAnalysis: [
    ({ context }) =>
      context.bodyAnalysis?.latestAnalysis?.summary
        ? `Senaste kroppsanalysen säger: ${context.bodyAnalysis.latestAnalysis.summary}. Använd den som riktning, inte som facit, och jämför helst över flera analyser.`
        : 'Jag hittar ingen kroppsanalys ännu. När du har två bilder kan analysen hjälpa dig följa hållning, konsekvens och förändringar över tid.',
  ],
  calories: [
    () =>
      'Tänk på kalorier som en riktning, inte en exakt dom. Börja med en mättande måltid med protein, grönsaker eller frukt och en lagom kolhydratkälla.',
  ],
  checkIn: [
    ({ context }) => {
      const energy = context.checkIn?.energy
      const mood = context.checkIn?.mood

      return `Din check-in visar ${energy ? `energi ${energy}/10` : 'att energi saknas'}${mood ? ` och humör: ${mood}` : ''}. Ett bra nästa steg är att välja en liten vana som passar dagsformen.`
    },
  ],
  food: [
    ({ context }) => {
      const mealCount = context.meals?.loggedMealsToday?.length || 0

      return mealCount > 0
        ? `Du har ${mealCount} måltid${mealCount === 1 ? '' : 'er'} loggad${mealCount === 1 ? '' : 'e'} idag. Nästa måltid kan vara enkel: protein, något grönt och en bas som potatis, ris, bröd eller pasta.`
        : 'Satsa på en enkel måltid idag: protein, något grönt eller frukt och en lagom kolhydratkälla. Det behöver inte bli perfekt för att vara bra.'
    },
  ],
  goalWeight: [
    ({ context }) => {
      const current = context.weight?.currentWeight
      const goal = context.profile?.goalWeight

      if (current && goal) {
        return `Du väger just nu ${current.toLocaleString('sv-SE')} kg och målet är ${goal} kg. Ta det som en riktning och fokusera på upprepbara veckovanor.`
      }

      return 'Jag saknar antingen aktuell vikt eller målvikt. Lägg gärna in båda, så kan jag räkna kvar till mål utan att gissa.'
    },
  ],
  habits: [
    ({ context }) => {
      const done = context.foods?.filter((item) => item.done).length || 0
      const total = context.foods?.length || 0

      return total
        ? `Du har ${done}/${total} vanor klara. Välj nästa enklaste vana, till exempel vatten, protein eller frukt/grönt.`
        : 'Välj en vana som är lätt att upprepa idag. Hellre liten och gjord än stor och svår.'
    },
  ],
  mealAnalysis: [
    ({ context }) =>
      context.meals?.latestMealAnalysis?.analysis?.summary
        ? `Senaste matanalysen visar: ${context.meals.latestMealAnalysis.analysis.summary}. Använd den som uppskattning och låt nästa måltid balansera dagen.`
        : 'Jag hittar ingen matfotoanalys ännu. När du analyserar en måltid kan jag hjälpa dig se protein, grönsaker och portionsbalans tydligare.',
  ],
  motivation: [
    () =>
      'Det är okej att det känns trögt. Gör bara ett nästa steg idag: drick vatten, ta en kort promenad eller ät en vanlig måltid utan att kompensera hårt.',
    () =>
      'Du behöver inte rädda hela veckan på en gång. Välj en sak som är lätt att göra nu, och låt det vara dagens vinst.',
  ],
  protein: [
    ({ context }) => {
      const current = context.weight?.currentWeight

      if (current) {
        const lower = Math.round(current * 1.2)
        const upper = Math.round(current * 1.6)

        return `Med din senaste vikt blir ett enkelt riktmärke ungefär ${lower}-${upper} g protein per dag. Fördela det över måltiderna så blir det lättare att nå.`
      }

      return 'Ett vanligt riktmärke är protein i varje måltid, till exempel ägg, kvarg, fisk, kyckling, tofu eller bönor.'
    },
  ],
  recipe: [
    () =>
      'Ett billigt och enkelt förslag: ägg eller bönor, potatis eller ris och frysta grönsaker. Lägg till yoghurt, keso eller tonfisk om du vill höja proteinet.',
  ],
  sleep: [
    ({ context }) => {
      const energy = context.checkIn?.energy

      return energy && energy <= 4
        ? 'Eftersom energin verkar låg kan kvällens bästa val vara en enkel rutin: lugn nedvarvning, lätt måltid vid hunger och en rimlig läggtid.'
        : 'För de flesta vuxna är 7-9 timmar sömn en bra riktning. Sikta hellre på jämn läggtid än perfekta siffror.'
    },
  ],
  stress: [
    () =>
      'När stressen är hög hjälper det ofta att sänka kraven. Välj ett konkret nästa steg: mat, vatten eller 10 minuter lugn rörelse.',
  ],
  training: [
    ({ context }) => {
      const steps = Number(context.checkIn?.steps)

      return Number.isFinite(steps)
        ? `Du har ${steps.toLocaleString('sv-SE')} steg i senaste check-in. Om du vill träna idag räcker ett kort pass eller en promenad bra.`
        : 'Välj träning som är lätt att genomföra idag: kort promenad, lätt styrka eller rörlighet. Det viktiga är att rutinen går att upprepa.'
    },
  ],
  weeklyReport: [
    ({ context }) =>
      context.weeklyReport?.summary
        ? `Senaste veckorapporten säger: ${context.weeklyReport.summary}. Jag skulle göra nästa vecka enkel och välja ett huvudfokus.`
        : 'Jag hittar ingen sparad veckorapport ännu. Skapa en rapport när du vill samla vikt, mat, rörelse och återhämtning i en tydligare bild.',
  ],
  weight: [
    ({ context }) => {
      const current = context.weight?.currentWeight
      const change = context.weight?.changeSinceStart
      const goal = context.profile?.goalWeight

      if (!current) {
        return 'Jag hittar ingen aktuell vikt just nu. Lägg in en vikt så kan jag följa trenden utan att gissa.'
      }

      const changeText = Number.isFinite(change)
        ? change < 0
          ? `Du har gått ner ${Math.abs(change).toLocaleString('sv-SE')} kg sedan start.`
          : change > 0
            ? `Du ligger ${change.toLocaleString('sv-SE')} kg över startvikten.`
            : 'Du ligger på samma vikt som start.'
        : ''
      const goalText = goal
        ? ` Målet är ${goal} kg.`
        : ''

      return `Du väger just nu ${current.toLocaleString('sv-SE')} kg. ${changeText}${goalText}`.trim()
    },
  ],
  general: [
    () =>
      'Jag är med. Vill du att vi fokuserar på mat, vikt, träning, sömn eller motivation just nu?',
    () =>
      'Absolut. Skriv vad du vill lösa härnäst, så håller jag svaret kort och konkret.',
  ],
}

function getVariationIndex(seed, length) {
  if (length <= 1) {
    return 0
  }

  const score = String(seed || '')
    .split('')
    .reduce((sum, character) => sum + character.charCodeAt(0), 0)

  return score % length
}

function getSafetyRules() {
  return [
    'Svara på svenska.',
    'Var vänlig, konkret och motiverande.',
    'Undvik upprepningar och standardsvar.',
    'Ge bara allmän wellness-coaching, inte medicinska diagnoser.',
    'Hitta inte på data som saknas.',
    'Om data saknas, säg det naturligt och föreslå nästa rimliga steg.',
    'Håll svaret kort om frågan är kort.',
  ].join('\n')
}

/**
 * Creates the OpenAI prompt for the smart AI coach conversation engine.
 *
 * @param {object} params
 * @param {object} params.context
 * @param {object} params.intent
 * @returns {string}
 */
export function createAiCoachPrompt({ context, intent }) {
  return `Du är Viktkollens smarta AI-coach.

Regler:
${getSafetyRules()}

Identifierad intent:
${JSON.stringify(intent)}

Relevant appkontext:
${JSON.stringify(context)}

Svara endast med giltig JSON:
{
  "reply": "kort naturligt svar på svenska"
}`
}

/**
 * Creates a smart local fallback answer when OpenAI is unavailable.
 *
 * @param {object} params
 * @param {object} params.context
 * @param {object} params.intent
 * @param {string} params.message
 * @returns {string}
 */
export function createLocalAiCoachReply({ context, intent, message }) {
  const deterministicReply = createDeterministicAiCoachReply({
    context,
    intent,
    message,
  })

  if (deterministicReply) {
    return deterministicReply
  }

  const templates = responseTemplates[intent.intent] || responseTemplates.general
  const template = templates[getVariationIndex(`${message}-${intent.intent}`, templates.length)]

  return template({ context, intent, message })
}
