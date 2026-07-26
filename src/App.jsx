import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AICoach from './components/AICoach.jsx'
import AuthPanel from './components/AuthPanel.jsx'
import BarcodeScanner from './components/BarcodeScanner.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import CheckIn from './components/CheckIn.jsx'
import CloudBackupPanel from './components/CloudBackupPanel.jsx'
import CloudStatusPanel from './components/CloudStatusPanel.jsx'
import Dashboard from './components/Dashboard.jsx'
import MealLogger from './components/MealLogger.jsx'
import MonthlyReport from './components/MonthlyReport.jsx'
import ProgressCenter from './components/ProgressCenter.jsx'
import ProgressPhotos from './components/ProgressPhotos.jsx'
import ReminderSettings from './components/ReminderSettings.jsx'
import WeeklyReport from './components/WeeklyReport.jsx'
import { makePersonalCoachReply } from './lib/coachReply.js'
import {
  bodyAnalysisHistoryChangedEvent,
  getAnalysisHistory,
} from './services/bodyAnalysisHistory.js'
import { buildAiCoachContext } from './services/aiCoachContext.js'
import { requestAiEndpoint } from './services/aiApiService.js'
import { addAiConversationMemory } from './services/aiConversationMemory.js'
import { classifyAiCoachIntent } from './services/aiCoachIntentService.js'
import { createLocalAiCoachReply } from './services/aiCoachPrompt.js'
import { createAiCoachV2Report } from './services/aiCoachV2Service.js'
import { createAiSuggestions } from './services/aiSuggestions.js'
import {
  getAuthErrorMessage,
  getAuthStatus,
  getCurrentAuthSession,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeToAuthChanges,
} from './services/authService.js'
import { buildAiUserContext } from './services/aiUserContext.js'
import { createDashboardData } from './services/dashboardService.js'
import {
  formatKg as formatHealthKg,
  getProteinNeedForContext,
  parseWeightValue,
} from './services/healthCalculations.js'
import {
  addMealAnalysis,
  clearMealHistory,
  createDemoMealDay,
  exportMealHistory,
  getMealHistory,
  getMealWeekSummary,
  importMealHistory,
  setMealHistory,
} from './services/mealHistory.js'
import { analyzeMealPhoto } from './services/mealAnalysisService.js'
import { createMonthlyHealthReport } from './services/monthlyReportService.js'
import {
  getTodayDateString as getNutritionTodayDateString,
  getWeekStart,
  mealDraftToMeal,
  normalizeFavoriteMeals,
  normalizeMeals,
  normalizeNutritionGoals,
  summarizeDay,
  summarizeWeek,
  upsertMeal,
  buildNutritionInsights,
} from './services/nutritionService.js'
import { getProactiveCoachInsights, makeProactiveCoachInsights } from './services/proactiveCoachService.js'
import {
  analyzeBodyMeasurements,
  analyzeWeights,
  createProgressInsights,
  createWeightProjection,
  normalizeBodyMeasurements,
  normalizeGoalSettings,
  normalizeWeights,
} from './services/progressService.js'
import * as userDataRepository from './services/userDataRepository.js'
import { createWeeklyReport as createAiWeeklyReport } from './services/weeklyReportService.js'

const starterWeights = [
  { date: '2026-05-23', value: 91.8 },
  { date: '2026-05-24', value: 91.2 },
  { date: '2026-05-25', value: 90.9 },
  { date: '2026-05-26', value: 90.4 },
  { date: '2026-05-27', value: 90.1 },
]

const initialFoods = [
  { id: 'protein', label: 'Protein till varje måltid (20-30 g)', done: true },
  { id: 'veg', label: 'Frukt eller grönsaker', done: true },
  { id: 'water', label: 'Vattenmål', done: false },
  { id: 'snack', label: 'Planerat mellanmål', done: false },
]

const initialMeals = [
  { id: 1, type: 'Frukost', text: 'Grekisk yoghurt, bär och havre' },
  { id: 2, type: 'Lunch', text: 'Kycklingwrap med sallad' },
]

const initialPhotoMeals = []

const initialScannedProducts = []

const initialProgressPhotos = []

const initialReminderSettings = {
  enabled: false,
  weight: true,
  weightTime: '08:00',
  meal: true,
  mealTime: '12:00',
  water: true,
  waterTime: '15:00',
}

const initialChatMessages = [
  {
    id: 1,
    role: 'assistant',
    text: 'Hej! Fråga mig om mat, vanor eller motivation så håller jag svaret kort och konkret.',
  },
]

const initialCheckIn = {
  energy: 6,
  steps: 7200,
  mood: 'Fokuserad',
  workout: true,
}

const initialProfile = {
  name: '',
  goal: 'gå ner i vikt',
  startWeight: '',
  goalWeight: '',
  activityLevel: 'Medel',
}

const goalOptions = ['gå ner i vikt', 'hålla vikten', 'bygga muskler']

const activityOptions = ['Låg', 'Medel', 'Hög']

function isStoredMeals(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.type === 'string' &&
        typeof entry.text === 'string' &&
        (typeof entry.id === 'number' || typeof entry.id === 'string'),
    )
  )
}

function isStoredPhotoMeals(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'number' &&
        typeof entry.image === 'string' &&
        typeof entry.createdAt === 'string' &&
        entry.analysis &&
        Number.isFinite(entry.analysis.calories) &&
        Number.isFinite(entry.analysis.protein) &&
        Number.isFinite(entry.analysis.carbs) &&
        Number.isFinite(entry.analysis.fat) &&
        Array.isArray(entry.analysis.foods) &&
        typeof entry.analysis.confidence === 'string' &&
        typeof entry.analysis.explanation === 'string',
    )
  )
}

function isStoredScannedProducts(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'number' &&
        typeof entry.barcode === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.createdAt === 'string' &&
        Number.isFinite(entry.calories) &&
        Number.isFinite(entry.protein) &&
        Number.isFinite(entry.carbs) &&
        Number.isFinite(entry.fat),
    )
  )
}

function isStoredProgressPhotos(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'number' &&
        typeof entry.image === 'string' &&
        typeof entry.createdAt === 'string' &&
        typeof entry.note === 'string' &&
        (entry.view === undefined ||
          entry.view === 'front' ||
          entry.view === 'side' ||
          entry.view === 'back' ||
          entry.view === 'other'),
    )
  )
}

function isStoredChatMessages(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.id === 'number' &&
        (entry.role === 'user' || entry.role === 'assistant') &&
        typeof entry.text === 'string',
    )
  )
}

function isStoredCheckIn(value) {
  return (
    value &&
    Number.isFinite(value.energy) &&
    Number.isFinite(value.steps) &&
    typeof value.mood === 'string' &&
    typeof value.workout === 'boolean'
  )
}

function isStoredProfile(value) {
  return (
    value &&
    typeof value.name === 'string' &&
    typeof value.goal === 'string' &&
    typeof value.startWeight === 'string' &&
    typeof value.goalWeight === 'string' &&
    typeof value.activityLevel === 'string'
  )
}

function isStoredReminderSettings(value) {
  return (
    value &&
    typeof value.enabled === 'boolean' &&
    typeof value.weight === 'boolean' &&
    typeof value.weightTime === 'string' &&
    typeof value.meal === 'boolean' &&
    typeof value.mealTime === 'string' &&
    typeof value.water === 'boolean' &&
    typeof value.waterTime === 'string'
  )
}

function readStoredFoods() {
  const storedFoods = userDataRepository.getFoods([], Array.isArray)

  return initialFoods.map((item) => {
    const storedItem = storedFoods.find((stored) => stored?.id === item.id)

    return {
      ...item,
      done:
        typeof storedItem?.done === 'boolean' ? storedItem.done : item.done,
    }
  })
}

function formatDecimal(value) {
  return value.toLocaleString('sv-SE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function formatWeight(value) {
  return formatHealthKg(value, {
    fallback: '',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })
}

function formatOptionalWeight(value) {
  const numericValue = parseWeight(String(value ?? ''))

  return Number.isFinite(numericValue) && numericValue > 0
    ? formatWeight(numericValue)
    : ''
}

function makeValidatedProfile(profile) {
  const startWeight = formatOptionalWeight(profile?.startWeight)
  const goalWeight =
    profile?.goal === 'gå ner i vikt'
      ? formatOptionalWeight(profile?.goalWeight)
      : ''

  return {
    ...(profile?.name?.trim() && { name: profile.name.trim() }),
    ...(profile?.goal?.trim() && { goal: profile.goal.trim() }),
    ...(startWeight && { startWeight }),
    ...(goalWeight && { goalWeight }),
    ...(profile?.activityLevel?.trim() && {
      activityLevel: profile.activityLevel.trim(),
    }),
  }
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function getProgressPhotoViewLabel(view) {
  if (view === 'front') {
    return 'framifrån'
  }

  if (view === 'side') {
    return 'från sidan'
  }

  if (view === 'back') {
    return 'bakifrån'
  }

  if (view === 'other') {
    return 'annan vy'
  }

  return 'samma perspektiv'
}

function makeProgressPhotoComparison(latestPhoto, previousPhoto) {
  if (!latestPhoto) {
    return null
  }

  const viewLabel = getProgressPhotoViewLabel(latestPhoto.view)

  if (!previousPhoto) {
    return {
      latestPhoto,
      previousPhoto: null,
      viewLabel,
      summary: `Lägg till en till bild ${viewLabel} för att skapa en försiktig V2-jämförelse.`,
      observations: [
        'När två bilder med samma perspektiv finns kan små visuella förändringar jämföras mer rättvist.',
        'Försök gärna använda liknande ljus, avstånd och hållning nästa gång.',
      ],
    }
  }

  const perspectiveObservation =
    latestPhoto.view === 'side'
      ? 'Sidoprofilen ser ut att kunna jämföras med föregående sidobild, men ljus och vinkel kan påverka intrycket.'
      : 'Midjeområdet och hållningen ser ut att kunna jämföras med föregående bild framifrån, men ljus och vinkel kan påverka intrycket.'

  return {
    latestPhoto,
    previousPhoto,
    viewLabel,
    summary: `Nyaste bilden ${viewLabel} jämförs med föregående bild från samma perspektiv.`,
    observations: [
      perspectiveObservation,
      'Hållningen ser ut att vara relativt lik, men små skillnader i pose kan påverka jämförelsen.',
      'Små visuella förändringar kan anas, men bilden räcker inte för att dra säkra slutsatser.',
    ],
  }
}

function parseWeight(value) {
  return parseWeightValue(value)
}

function isValidWeightInput(value) {
  const numericValue = parseWeight(value)

  return Number.isFinite(numericValue) && numericValue > 0
}

function makeCoachMessage(profile, checkIn, foods, meals) {
  const completedFoods = foods.filter((item) => item.done).length
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hålla en stabil rutin'
  const canDiscussWeightLoss = goal === 'gå ner i vikt'
  const canDiscussMuscleGain = goal === 'bygga muskler'
  const focusHint = canDiscussMuscleGain
    ? 'Fokus: protein, styrka och återhämtning.'
    : canDiscussWeightLoss
      ? 'Fokus: enkla måltider och jämn rörelse.'
      : 'Fokus: stabil energi och upprepbara vanor.'
  const energyHint =
    checkIn.energy >= 7
      ? 'Energin är bra: lägg in ett pass eller en promenad.'
      : checkIn.energy >= 4
        ? 'Energin är okej: håll rutinen enkel.'
        : 'Energin är låg: välj återhämtning och en lätt måltid.'
  const nutritionHint =
    completedFoods >= 3
      ? 'Matchecklistan ser stark ut.'
      : 'Lägg till protein eller grönsaker i nästa måltid.'
  const mealHint =
    meals.length > 0
      ? `${meals.length} måltider loggade i dag.`
      : 'Logga en snabb måltid när du kan.'

  return `${name}, dagens riktning:
• ${focusHint}
• ${energyHint}
• ${nutritionHint}
• ${mealHint}`
}

function hasBedtimeEatingContext(message, chatHistory = []) {
  const text = [
    ...chatHistory.slice(-4).map((entry) => entry?.text ?? ''),
    message,
  ]
    .join(' ')
    .toLowerCase()

  return (
    (text.includes('lägga mig') ||
      text.includes('sova') ||
      text.includes('sover') ||
      text.includes('läggdags') ||
      text.includes('lägger mig') ||
      text.includes('innan jag ska lägga')) &&
    (text.includes('äter') ||
      text.includes('äta') ||
      text.includes('åt') ||
      text.includes('mat'))
  )
}

function asksIfHarmful(message) {
  const text = message.toLowerCase()

  return (
    text.includes('skadligt') ||
    text.includes('farligt') ||
    text.includes('dåligt för kroppen') ||
    text.includes('inte bra för kroppen')
  )
}

function asksAboutRapidWeightLoss(message) {
  const text = message.toLowerCase()

  return (
    (text.includes('gå ner') ||
      text.includes('tappa') ||
      text.includes('minska')) &&
    text.includes('kg') &&
    (text.includes('vecka') ||
      text.includes('snabbt') ||
      text.includes('fort'))
  )
}

function asksAboutSleep(message) {
  const text = message.toLowerCase()

  return text.includes('sov') || text.includes('sömn') || text.includes('sova')
}

function asksAboutFood(message) {
  const text = message.toLowerCase()

  return (
    text.includes('mat') ||
    text.includes('äta') ||
    text.includes('äter') ||
    text.includes('middag') ||
    text.includes('ikväll')
  )
}

function asksAboutProteinKnowledge(message) {
  const text = message.toLowerCase()

  return (
    text.includes('protein') &&
    (text.includes('hur mycket') ||
      text.includes('hur många') ||
      text.includes('gram') ||
      text.includes('per dag') ||
      text.includes('om dagen') ||
      text.includes('rekommend') ||
      text.includes('bra för'))
  )
}

function asksForMealSuggestion(message) {
  const text = message.toLowerCase()

  return (
    text.includes('lunch') ||
    text.includes('middag') ||
    text.includes('ikväll') ||
    text.includes('mellanmål') ||
    text.includes('vad ska jag äta') ||
    text.includes('matförslag') ||
    (text.includes('billig') && text.includes('proteinrik'))
  )
}

function isMeaninglessMessage(message) {
  const text = message.trim().toLowerCase()

  return (
    text.length === 0 ||
    /^[^\p{L}\p{N}]+$/u.test(text) ||
    /^(ok|okej|mm|mhm|test|asdf|qwerty)$/i.test(text)
  )
}

function makeCommonWellnessReply(message) {
  const text = message.toLowerCase()

  if (text.includes('sov') || text.includes('sömn') || text.includes('sova')) {
    return 'För de flesta vuxna är 7–9 timmars sömn en bra riktlinje. 8 timmar är alltså ett bra mål, men det viktigaste är hur du mår på dagen och om sömnen känns återhämtande.'
  }

  if (text.includes('stress') || text.includes('stressad')) {
    return 'Stress påverkar både energi, hunger och motivation. Testa att sänka kraven för resten av dagen: ät något enkelt, ta fem lugna minuter och välj bara en sak som behöver bli gjord. Vad stressar mest just nu?'
  }

  if (text.includes('träna') || text.includes('träning') || text.includes('gym') || text.includes('promenad')) {
    return 'Ja, rörelse är oftast en bra idé om kroppen känns okej. Håll nivån efter dagsformen: promenad om du är trött, styrka eller intervaller om du har mer energi. Vad hade du tänkt träna?'
  }

  if (text.includes('vana') || text.includes('rutin') || text.includes('disciplin')) {
    return 'Börja mindre än du tycker behövs. En vana fastnar lättare om den är enkel att upprepa, till exempel samma frukost, en kort promenad eller att logga första måltiden. Vilken rutin vill du få ordning på?'
  }

  if (text.includes('mat') || text.includes('hungrig') || text.includes('äta')) {
    return 'Sikta på något enkelt: protein, en kolhydratkälla och frukt eller grönsaker. Till exempel äggmacka, kyckling med ris eller yoghurt med bär. Vill du ha förslag för frukost, lunch eller middag?'
  }

  return ''
}

function makeSleepReply(message) {
  const text = message.toLowerCase()
  const wakeMatch = text.match(/(?:vakna|går upp|går upp|upp)\s*(?:kl\.?|klockan)?\s*(\d{1,2})(?::|\.?)(\d{2})?/)
  const wakeHour = wakeMatch ? Number(wakeMatch[1]) : null
  const wakeMinute = wakeMatch?.[2] ? Number(wakeMatch[2]) : 0

  if (Number.isFinite(wakeHour) && wakeHour >= 0 && wakeHour <= 23) {
    const bedtimeStart = new Date(0, 0, 0, wakeHour, wakeMinute)
    bedtimeStart.setHours(bedtimeStart.getHours() - 9)
    const bedtimeEnd = new Date(0, 0, 0, wakeHour, wakeMinute)
    bedtimeEnd.setHours(bedtimeEnd.getHours() - 7)
    const formatTime = (date) =>
      date.toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      })

    return `För de flesta vuxna är 7-9 timmars sömn en bra riktlinje. Om du ska gå upp ${formatTime(new Date(0, 0, 0, wakeHour, wakeMinute))} kan ett rimligt sovfönster vara ungefär ${formatTime(bedtimeStart)}-${formatTime(bedtimeEnd)}. Försök hålla tiden ganska jämn även på vardagar.`
  }

  return 'För de flesta vuxna är 7-9 timmars sömn en bra riktlinje. 8 timmar är ett bra mål, men försök framför allt ha en ganska konsekvent läggtid och se hur pigg du är dagen efter.'
}

function makeRapidWeightLossReply() {
  return 'Att gå ner 2 kg på en vecka kan hända, men mycket är ofta vätska och det kan vara svårt att behålla. Sikta hellre på vanor som går att upprepa: protein i varje måltid, mycket grönsaker, lagom portioner, vardagsrörelse och bra sömn. Undvik extrem svält eller hård kompensation. Vill du kan jag göra en enkel 7-dagars plan som är rimlig och inte extrem.'
}

function makeBedtimeEatingReply() {
  return 'För de flesta är det inte skadligt att äta nära läggdags. Det kan däremot påverka sömn, reflux, hungervanor eller göra det lättare att äta mer än man tänkt. Om du är hungrig sent, testa något lättare som yoghurt, ägg, keso eller en liten macka.'
}

function makeProteinKnowledgeReply(message) {
  const proteinNeed = getProteinNeedForContext({ message })

  if (proteinNeed) {
    const lower = proteinNeed.lower
    const upper = proteinNeed.upper
    const activeUpper = proteinNeed.activeUpper

    return `För en person som väger ${formatWeight(proteinNeed.weight)} är ett rimligt riktmärke ofta cirka ${lower}-${upper} g protein per dag. Om personen styrketränar mycket eller vill bygga muskler kan ungefär ${upper}-${activeUpper} g per dag vara mer relevant. Fördela gärna över 3-4 måltider, till exempel 25-40 g per måltid.`
  }

  return 'Ett vanligt riktmärke är cirka 1,2-1,6 g protein per kilo kroppsvikt per dag för en aktiv vardag. Vid mycket styrketräning kan behovet ligga högre, ofta runt 1,6-2,0 g/kg. Fördela det gärna över flera måltider.'
}

function makeMultiPartReply(message, chatHistory = []) {
  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return makeBedtimeEatingReply()
  }

  const parts = []

  if (asksForMealSuggestion(message) || asksAboutFood(message)) {
    parts.push(`Mat idag: välj något enkelt och mättande:
• Kyckling + potatis + frysta grönsaker
• Äggwrap med keso och vitkål
• Linsgryta med ris`)
  }

  if (asksAboutSleep(message)) {
    parts.push(makeSleepReply(message))
  }

  if (asksAboutRapidWeightLoss(message)) {
    parts.push(makeRapidWeightLossReply())
  }

  return parts.length > 1 ? parts.join('\n\n') : ''
}

function makeChatResponse(
  message,
  profile,
  checkIn,
  foods,
  currentWeight,
  chatHistory = [],
  weights = [],
  meals = [],
) {
  const text = message.toLowerCase()
  const goal = profile?.goal || 'hålla en stabil rutin'
  const goalWeight = profile?.goalWeight?.trim()
  const canDiscussWeightLoss = goal === 'gå ner i vikt'
  const canDiscussMuscleGain = goal === 'bygga muskler'
  const weightContext = canDiscussWeightLoss && goalWeight
    ? `Nuvarande vikt är ${formatWeight(currentWeight)} och målvikt är ${goalWeight} kg.`
    : canDiscussMuscleGain
      ? 'Fokus: styrka, protein och återhämtning.'
      : 'Fokus: stabil energi och jämna måltider.'
  const daysMatch = text.match(/(\d+)\s*(dag|dagar)/)
  const planDays = daysMatch
    ? Math.min(Math.max(Number(daysMatch[1]), 2), 7)
    : text.includes('flera dagar') || text.includes('veckoplan') || text.includes('matschema')
      ? 3
      : 0

  if (isMeaninglessMessage(message)) {
    return 'Jag hängde inte riktigt med där. Skriv gärna frågan en gång till.'
  }

  const multiPartReply = makeMultiPartReply(message, chatHistory)

  if (multiPartReply) {
    return multiPartReply
  }

  if (planDays) {
    const dayTemplates = [
      ['Äggwrap med vitkål och keso', 'Kyckling, potatis och frysta grönsaker', 1750, 115],
      ['Tonfisk med ris, majs och gurka', 'Linsgryta med potatis och yoghurt', 1800, 105],
      ['Keso, kokt ägg, knäckebröd och frukt', 'Tofuwok med nudlar och wokgrönsaker', 1700, 100],
      ['Bönsallad med pasta och ägg', 'Fiskpinnar, potatis och ärtor', 1850, 105],
      ['Kycklingwrap med grönsaker', 'Chili på bönor med ris', 1780, 110],
      ['Havregrynsgröt, kvarg och bär', 'Omelett med potatis', 1650, 95],
      ['Tonfiskmackor med ägg', 'Kycklinggryta med ris', 1900, 120],
    ].slice(0, planDays)

    return `En enkel plan:
${dayTemplates
  .map(
    ([lunch, dinner, calories, protein], index) =>
      `Dag ${index + 1}: ${lunch} + ${dinner} (${calories} kcal, ${protein} g protein)`,
  )
  .join('\n')}

Handla: ägg, kyckling/tonfisk, linser/bönor, potatis/ris och frysta grönsaker.`
  }

  if (/^(hej|hejsan|hallå|tjena|god morgon|god kväll)[!.\s]*$/i.test(message.trim())) {
    return 'Hej! Hur kan jag hjälpa dig idag?'
  }

  const personalReply = makePersonalCoachReply({
    checkIn,
    currentWeight,
    foods,
    meals,
    message,
    profile,
    weights,
  })

  if (personalReply) {
    return personalReply
  }

  if (asksAboutRapidWeightLoss(message)) {
    return makeRapidWeightLossReply()
  }

  if (asksAboutProteinKnowledge(message)) {
    return makeProteinKnowledgeReply(message)
  }

  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return makeBedtimeEatingReply()
  }

  if (asksIfHarmful(message)) {
    return 'Oftast beror det på vad det gäller, mängd och hur du mår av det. Det är sällan en enskild vana är "skadlig" i sig, men den kan påverka sömn, energi, mage eller rutiner. Berätta gärna vad du syftar på, så kan jag svara mer konkret.'
  }

  if (text.includes('hur mycket') && text.includes('väger')) {
    return Number.isFinite(Number(currentWeight))
      ? `Din senaste registrerade vikt är ${formatWeight(currentWeight)}.`
      : 'Jag hittar ingen giltig vikt i loggen just nu.'
  }

  if (text.includes('pizza') || text.includes('sugen')) {
    const goalHint =
      goal === 'gå ner i vikt'
        ? 'Om målet är viktnedgång kan du fortfarande äta pizza.'
        : 'Det kan absolut få plats i en vanlig rutin.'

    return `${goalHint} Ta en normal portion och komplettera gärna med sallad eller något proteinrikt om du vill bli mättare. Är det lunch eller middag du funderar på?`
  }

  if (
    (text.includes('åt') || text.includes('ätit')) &&
    (text.includes('dåligt') || text.includes('onyttigt') || text.includes('helgen'))
  ) {
    return `Det är lugnt, en helg förstör ingenting. Gör en enkel reset: drick vatten, ät en vanlig proteinrik måltid och ta en kort promenad om det känns bra. Försök gå tillbaka till rutinen utan att kompensera hårt. Vad var det som gjorde helgen svårast?`
  }

  if (
    text.includes('ikväll') ||
    text.includes('middag') ||
    text.includes('vad ska jag äta')
  ) {
    return `Testa något enkelt ikväll:
• Kyckling + potatis + frysta grönsaker
• Äggwrap med keso och vitkål
• Linsgryta med ris

Välj det som går snabbast att laga.`
  }

  if (text.includes('mellanmål')) {
    return `Snabba mellanmål:
• Kvarg + bär
• Ägg på knäckebröd
• Keso + frukt

Ta det som kräver minst fix.`
  }

  if (text.includes('motivation') || text.includes('motiver')) {
    return `Det händer alla. Försök fokusera på nästa lilla steg i stället för hela målet. Det kan räcka med något väldigt enkelt i dag. Vad känns svårast just nu – maten, träningen eller att hålla rutinen?`
  }

  if (asksAboutSleep(message)) {
    return makeSleepReply(message)
  }

  if (text.includes('billig') || text.includes('proteinrik lunch') || text.includes('lunch')) {
    return `Billig proteinrik lunch:
• Tonfisk + ris + majs
• Äggwrap + keso + grönsaker
• Linsgryta + potatis

Välj en och upprepa den i veckan.`
  }

  if (text.includes('vikt') || text.includes('mål')) {
    if (canDiscussWeightLoss) {
      return `${weightContext} Titta helst på trenden över flera dagar, inte bara en enskild vägning. Vill du att jag jämför de senaste registreringarna åt dig?`
    }

    if (canDiscussMuscleGain) {
      return 'För muskelbygge är vikten bara en del av bilden. Det är ofta mer användbart att följa styrka, energi, protein och återhämtning.'
    }

    return 'Om målet är att hålla vikten är en stabil trend oftast ett bra tecken. Titta på veckosnittet snarare än en enskild dag.'
  }

  return makeCommonWellnessReply(message) || 'Jag hängde inte riktigt med där. Kan du skriva lite mer om vad du menar?'
}


function makeProductFromBarcode(barcode) {
  const digits = barcode.replace(/\D/g, '')
  const seed = [...digits].reduce((sum, digit) => sum + Number(digit), 0)
  const protein = 6 + (seed % 24)
  const carbs = 12 + ((seed * 3) % 48)
  const fat = 3 + ((seed * 5) % 22)

  return {
    id: Date.now(),
    barcode,
    name: `Skannad produkt ${barcode.slice(-4) || barcode}`,
    calories: Math.round(protein * 4 + carbs * 4 + fat * 9),
    protein,
    carbs,
    fat,
    createdAt: new Date().toISOString(),
  }
}

function App() {
  const barcodeVideoRef = useRef(null)
  const barcodeStreamRef = useRef(null)
  const barcodeTimerRef = useRef(null)
  const chatThreadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const [authSession, setAuthSession] = useState(null)
  const authStatus = useMemo(() => getAuthStatus(), [])
  const [profile, setProfile] = useState(() =>
    userDataRepository.getProfile(null, isStoredProfile),
  )
  const [profileForm, setProfileForm] = useState(() => ({
    ...initialProfile,
    ...(userDataRepository.getProfile(null, isStoredProfile) ?? {}),
  }))
  const [profileError, setProfileError] = useState('')
  const [proactiveCoachResult, setProactiveCoachResult] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(() => !profile)
  const [checkIn, setCheckIn] = useState(() =>
    userDataRepository.getCheckIn(initialCheckIn, isStoredCheckIn),
  )
  const [weights, setWeights] = useState(() =>
    normalizeWeights(userDataRepository.getWeights(starterWeights, Array.isArray)),
  )
  const [bodyMeasurements, setBodyMeasurements] = useState(() =>
    normalizeBodyMeasurements(userDataRepository.getBodyMeasurements([], Array.isArray)),
  )
  const [progressGoalSettings, setProgressGoalSettings] = useState(() =>
    normalizeGoalSettings(
      userDataRepository.getProgressGoalSettings({}, (value) =>
        value && typeof value === 'object' && !Array.isArray(value),
      ),
    ),
  )
  const [progressReports, setProgressReports] = useState(() =>
    userDataRepository.getProgressReports([], Array.isArray),
  )
  const [foods, setFoods] = useState(readStoredFoods)
  const [meals, setMeals] = useState(() =>
    normalizeMeals(userDataRepository.getMeals(initialMeals, isStoredMeals)),
  )
  const [nutritionGoals, setNutritionGoals] = useState(() =>
    normalizeNutritionGoals(
      userDataRepository.getNutritionGoals({}, (value) =>
        value && typeof value === 'object' && !Array.isArray(value),
      ),
    ),
  )
  const [favoriteMeals, setFavoriteMeals] = useState(() =>
    normalizeFavoriteMeals(userDataRepository.getFavoriteMeals([], Array.isArray)),
  )
  const [selectedMealDate, setSelectedMealDate] = useState(() => getNutritionTodayDateString())
  const [foodPhotoPreview, setFoodPhotoPreview] = useState('')
  const [mealHistoryImportSummary, setMealHistoryImportSummary] = useState(null)
  const [photoAnalysisStatus, setPhotoAnalysisStatus] = useState('')
  const [photoMeals, setPhotoMeals] = useState(() => {
    const storedMealHistory = getMealHistory()

    if (storedMealHistory.length > 0) {
      return storedMealHistory
    }

    return setMealHistory(
      userDataRepository.getLegacyPhotoMeals(
        initialPhotoMeals,
        isStoredPhotoMeals,
      ),
    )
  })
  const [showClearMealHistoryConfirm, setShowClearMealHistoryConfirm] =
    useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeStatus, setBarcodeStatus] = useState('')
  const [barcodeScannerActive, setBarcodeScannerActive] = useState(false)
  const [scannedProducts, setScannedProducts] = useState(() =>
    userDataRepository.getScannedProducts(
      initialScannedProducts,
      isStoredScannedProducts,
    ),
  )
  const [progressPhotoNote, setProgressPhotoNote] = useState('')
  const [beforePhotoId, setBeforePhotoId] = useState('')
  const [afterPhotoId, setAfterPhotoId] = useState('')
  const [progressPhotos, setProgressPhotos] = useState(() =>
    userDataRepository.getProgressPhotos(
      initialProgressPhotos,
      isStoredProgressPhotos,
    ),
  )
  const [reminderSettings, setReminderSettings] = useState(() =>
    userDataRepository.getReminderSettings(
      initialReminderSettings,
      isStoredReminderSettings,
    ),
  )
  const [reminderStatus, setReminderStatus] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatEngineStatus, setChatEngineStatus] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [chatMessages, setChatMessages] = useState(() =>
    userDataRepository.getCoachChat(initialChatMessages, isStoredChatMessages),
  )
  const [coachReports, setCoachReports] = useState(() =>
    userDataRepository.getAiCoachReports([], Array.isArray),
  )
  const [isGeneratingCoachReport, setIsGeneratingCoachReport] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState('')
  const [weeklyReportData, setWeeklyReportData] = useState(null)
  const [weeklyReportStatus, setWeeklyReportStatus] = useState('')
  const [bodyAnalysisHistory, setBodyAnalysisHistory] = useState(() =>
    getAnalysisHistory(),
  )

  const latestWeight = weights.at(-1)
  const startWeight = weights[0]
  const aiUserContext = useMemo(
    () =>
      buildAiUserContext({
        bodyAnalysisHistory,
        chatHistory: chatMessages,
        checkIn,
        currentWeight: latestWeight.value,
        foods,
        latestWeeklyReport: weeklyReportData,
        mealHistory: getMealHistory(),
        meals,
        profile: makeValidatedProfile(profile),
        weights,
      }),
    [
      bodyAnalysisHistory,
      chatMessages,
      checkIn,
      foods,
      latestWeight.value,
      meals,
      profile,
      weeklyReportData,
      weights,
    ],
  )
  const aiStarterPrompts = useMemo(
    () => createAiSuggestions(aiUserContext).slice(0, 4),
    [aiUserContext],
  )
  const weightChange = Number((latestWeight.value - startWeight.value).toFixed(1))
  const foodScore = foods.filter((item) => item.done).length
  const progressAnalysis = useMemo(
    () => analyzeWeights(weights, makeValidatedProfile(profile)),
    [profile, weights],
  )
  const progressProjection = useMemo(
    () => createWeightProjection(weights, makeValidatedProfile(profile)),
    [profile, weights],
  )
  const bodyMeasurementAnalysis = useMemo(
    () => analyzeBodyMeasurements(bodyMeasurements),
    [bodyMeasurements],
  )
  const progressInsights = useMemo(
    () =>
      createProgressInsights({
        bodyMeasurements,
        profile: makeValidatedProfile(profile),
        weights,
      }),
    [bodyMeasurements, profile, weights],
  )
  const beforePhoto =
    progressPhotos.find((photo) => String(photo.id) === beforePhotoId) ??
    progressPhotos.at(-1)
  const afterPhoto =
    progressPhotos.find((photo) => String(photo.id) === afterPhotoId) ??
    progressPhotos[0]
  const latestProgressPhoto = progressPhotos[0] ?? null
  const previousSameViewPhoto = latestProgressPhoto
    ? ['front', 'side'].includes(latestProgressPhoto.view)
      ? progressPhotos.find(
        (photo) =>
          photo.id !== latestProgressPhoto.id &&
          photo.view === latestProgressPhoto.view,
      )
      : null
    : null
  const progressPhotoComparison = makeProgressPhotoComparison(
    latestProgressPhoto,
    previousSameViewPhoto,
  )
  const progressPhotoComparisonImages = progressPhotoComparison
    ? [
      progressPhotoComparison.previousPhoto,
      progressPhotoComparison.latestPhoto,
    ]
      .filter(Boolean)
      .map((photo, index) => ({
        alt:
          index === 0
            ? 'Tidigare jämförelsebild'
            : 'Nyaste jämförelsebild',
        caption: `${index === 0 ? 'Tidigare' : 'Nyaste'} · ${formatFullDate(photo.createdAt)}`,
        id: `${photo.id}-${index}`,
        image: photo.image,
      }))
    : []
  const progressPhotoItems = progressPhotos.map((photo) => ({
    alt:
      photo.view === 'front'
        ? 'Framstegsbild framifrån'
        : photo.view === 'side'
          ? 'Framstegsbild från sidan'
          : photo.view === 'back'
            ? 'Framstegsbild bakifrån'
            : 'Framstegsbild annan vy',
    createdAtLabel: formatFullDate(photo.createdAt),
    id: photo.id,
    image: photo.image,
    note: photo.note || 'Ingen anteckning',
    viewLabel:
      photo.view === 'front'
        ? 'Framifrån'
        : photo.view === 'side'
          ? 'Från sidan'
          : photo.view === 'back'
            ? 'Bakifrån'
            : 'Annan vy',
    weightLabel: photo.weight ? formatWeight(photo.weight) : 'Vikt saknas',
  }))
  const progressPhotoOptions = progressPhotos.map((photo) => ({
    id: photo.id,
    label: formatFullDate(photo.createdAt),
  }))
  const beforeAfterPhotos = [beforePhoto, afterPhoto]
    .filter(Boolean)
    .map((photo, index) => ({
      alt: index === 0 ? 'Förebild' : 'Efterbild',
      caption: `${index === 0 ? 'Före' : 'Efter'} · ${formatFullDate(photo.createdAt)}`,
      id: `${photo.id}-${index}`,
      image: photo.image,
    }))
  const reminderOptions = [
    {
      enabledKey: 'weight',
      label: 'Viktpåminnelse',
      timeKey: 'weightTime',
    },
    {
      enabledKey: 'meal',
      label: 'Måltidsloggning',
      timeKey: 'mealTime',
    },
    {
      enabledKey: 'water',
      label: 'Vattenpåminnelse',
      timeKey: 'waterTime',
    },
  ]
  const safeProfileGoalWeight =
    profile?.goal === 'gå ner i vikt'
      ? formatOptionalWeight(profile?.goalWeight)
      : ''
  const profileSummaryParts = [
    profile?.goal,
    safeProfileGoalWeight ? `mål ${safeProfileGoalWeight}` : '',
    profile?.activityLevel ? `aktivitet ${profile.activityLevel}` : '',
  ].filter(Boolean)
  const displayPhotoMeals = photoMeals.map((entry) => ({
    ...entry,
    likelyProtein:
      entry.analysis.likelyProtein ||
      entry.analysis.foods[0] ||
      'ser ut att innehålla en proteinkälla',
    likelyVegetables:
      entry.analysis.likelyVegetables ||
      entry.analysis.foods[1] ||
      'troligen grönsaker eller sallad',
    likelyCarbs:
      entry.analysis.likelyCarbs ||
      entry.analysis.foods[2] ||
      'kan innehålla en kolhydratkälla',
    summary:
      entry.analysis.summary ||
      `Ser ut att innehålla ${entry.analysis.foods.join(', ')}.`,
    positiveFeedback:
      entry.analysis.positiveFeedback ||
      'Bra att du använder fotoanalysen för att reflektera över måltiden.',
    improvementSuggestion:
      entry.analysis.improvementSuggestion ||
      'Ett enkelt nästa steg kan vara att lägga till en tydlig grönsak eller proteinkälla.',
    analysis: {
      ...entry.analysis,
      cheapNextMealSuggestion:
        entry.analysis.cheapNextMealSuggestion ||
        'Liknande måltid billigare: bygg basen på ägg, potatis, bönor eller frysta grönsaker.',
      coachSummary:
        entry.analysis.coachSummary ||
        'Protein, grönsaker och portion bedöms som en enkel helhet. Använd analysen som riktning, inte facit.',
      fiberCarbBalance:
        entry.analysis.fiberCarbBalance ||
        'Välj gärna fullkorn, potatis, frukt eller grönsaker för bättre fiberbalans.',
      improvement:
        entry.analysis.improvement ||
        entry.analysis.improvementSuggestion ||
        'Lägg till en frukt eller grönsak.',
      mealType: entry.analysis.mealType || entry.mealType || 'Lunch',
      portionEstimate:
        entry.analysis.portionEstimate || entry.analysis.portionSize || 'Lagom',
      portionSize:
        entry.analysis.portionSize || entry.analysis.portionEstimate || 'Lagom',
      proteinStatus:
        entry.analysis.proteinStatus ||
        entry.analysis.likelyProtein ||
        'Medel',
      vegetableStatus:
        entry.analysis.vegetableStatus ||
        entry.analysis.likelyVegetables ||
        'Bra',
    },
  }))
  const mealWeekSummary = getMealWeekSummary(photoMeals)
  const selectedNutritionWeekStart = useMemo(
    () => getWeekStart(selectedMealDate),
    [selectedMealDate],
  )
  const dailyNutritionSummary = useMemo(
    () => summarizeDay(meals, selectedMealDate, nutritionGoals),
    [meals, nutritionGoals, selectedMealDate],
  )
  const weeklyNutritionSummary = useMemo(
    () => summarizeWeek(meals, selectedNutritionWeekStart, nutritionGoals),
    [meals, nutritionGoals, selectedNutritionWeekStart],
  )
  const nutritionInsights = useMemo(
    () =>
      buildNutritionInsights({
        goals: nutritionGoals,
        meals,
        weekStart: selectedNutritionWeekStart,
      }),
    [meals, nutritionGoals, selectedNutritionWeekStart],
  )
  const monthlyReport = useMemo(
    () =>
      createMonthlyHealthReport({
        mealHistory: photoMeals,
        meals,
        weights,
      }),
    [meals, photoMeals, weights],
  )
  const weeklyReportLines = useMemo(
    () =>
      weeklyReport
        ? weeklyReport.split('\n').map((line, index) => ({
          id: `${line}-${index}`,
          isHeading: line.startsWith('###'),
          text: line.replace('### ', ''),
        }))
        : [],
    [weeklyReport],
  )

  const fallbackCoachMessage = useMemo(
    () =>
      makeCoachMessage(
        profile,
        checkIn,
        foods,
        meals,
      ),
    [checkIn, foods, meals, profile],
  )
  const dailyCoachKey = useMemo(
    () =>
      JSON.stringify({
        checkIn,
        currentWeight: latestWeight.value,
        foods,
        meals,
        profile,
        weights,
      }),
    [checkIn, foods, latestWeight.value, meals, profile, weights],
  )
  const [dailyCoachResult, setDailyCoachResult] = useState(null)
  const hasFreshDailyCoach = dailyCoachResult?.key === dailyCoachKey
  const coachMessage = hasFreshDailyCoach && dailyCoachResult.summary
    ? dailyCoachResult.summary
    : fallbackCoachMessage
  const coachStatus = hasFreshDailyCoach
    ? dailyCoachResult.source === 'openai'
      ? 'AI-genererad daglig sammanfattning.'
      : 'Lokal fallback används just nu.'
    : authSession && !showOnboarding
      ? 'Uppdaterar AI-coach...'
      : ''
  const latestCoachReport = coachReports[0] || null
  const currentCoachPreview = useMemo(
    () =>
      createAiCoachV2Report({
        checkIn,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        nutritionInsights,
        nutritionSummary: dailyNutritionSummary,
        previousReports: coachReports,
        progressAnalysis,
        progressInsights,
        progressProjection,
        profile: makeValidatedProfile(profile),
        bodyMeasurementAnalysis,
        bodyMeasurements,
        weeklyNutrition: weeklyNutritionSummary,
        weights,
      }),
    [
      checkIn,
      coachReports,
      dailyNutritionSummary,
      meals,
      nutritionGoals,
      nutritionInsights,
      photoMeals,
      profile,
      progressAnalysis,
      progressInsights,
      progressProjection,
      bodyMeasurementAnalysis,
      bodyMeasurements,
      weeklyNutritionSummary,
      weights,
    ],
  )

  const proactiveCoachKey = useMemo(
    () =>
      JSON.stringify({
        checkIn,
        meals,
        photoMeals,
        weights,
      }),
    [checkIn, meals, photoMeals, weights],
  )
  const fallbackProactiveCoachInsights = useMemo(
    () =>
      makeProactiveCoachInsights({
        bodyAnalysisHistory,
        checkIn,
        mealHistory: photoMeals,
        meals,
        weights,
      }),
    [bodyAnalysisHistory, checkIn, meals, photoMeals, weights],
  )
  const proactiveCoachInsights =
    proactiveCoachResult?.key === proactiveCoachKey
      ? proactiveCoachResult.insights
      : fallbackProactiveCoachInsights
  const createWeeklyReport = useCallback(async () => {
    setWeeklyReportStatus('Skapar AI-veckorapport...')

    const report = await createAiWeeklyReport({
      bodyAnalysisHistory,
      checkIn,
      currentWeight: latestWeight.value,
      foods,
      mealHistory: photoMeals,
      meals,
      proactiveCoach: proactiveCoachInsights,
      profile: makeValidatedProfile(profile),
      weights,
    })

    setWeeklyReportData(report)
    setWeeklyReport('')
    setWeeklyReportStatus(
      report.source === 'openai'
        ? 'AI-genererad veckorapport.'
        : 'Smart fallback används just nu.',
    )
  }, [
    checkIn,
    bodyAnalysisHistory,
    foods,
    latestWeight.value,
    meals,
    photoMeals,
    proactiveCoachInsights,
    profile,
    weights,
  ])
  const createCoachReport = useCallback(() => {
    setIsGeneratingCoachReport(true)

    window.setTimeout(() => {
      const report = createAiCoachV2Report({
        checkIn,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        nutritionInsights,
        nutritionSummary: dailyNutritionSummary,
        previousReports: coachReports,
        progressAnalysis,
        progressInsights,
        progressProjection,
        profile: makeValidatedProfile(profile),
        bodyMeasurementAnalysis,
        bodyMeasurements,
        weeklyNutrition: weeklyNutritionSummary,
        weights,
      })

      setCoachReports((current) => [report, ...current].slice(0, 20))
      setIsGeneratingCoachReport(false)
    }, 350)
  }, [
    checkIn,
    coachReports,
    dailyNutritionSummary,
    meals,
    nutritionGoals,
    nutritionInsights,
    photoMeals,
    profile,
    progressAnalysis,
    progressInsights,
    progressProjection,
    bodyMeasurementAnalysis,
    bodyMeasurements,
    weeklyNutritionSummary,
    weights,
  ])
  const deleteCoachReport = useCallback((reportId) => {
    setCoachReports((current) => current.filter((report) => report.id !== reportId))
  }, [])
  const clearCoachReports = useCallback(() => {
    const shouldClear = window.confirm('Vill du rensa all coachhistorik?')

    if (shouldClear) {
      setCoachReports([])
    }
  }, [])
  const dashboardData = useMemo(
    () =>
      createDashboardData({
        aiCoachMemory: chatMessages,
        bodyAnalysisHistory,
        checkIn,
        foods,
        mealHistory: photoMeals,
        meals,
        profile,
        proactiveCoach: proactiveCoachInsights,
        weights,
        weeklyReportData,
        weeklyReportLines,
      }),
    [
      bodyAnalysisHistory,
      chatMessages,
      checkIn,
      foods,
      meals,
      photoMeals,
      profile,
      proactiveCoachInsights,
      weeklyReportData,
      weeklyReportLines,
      weights,
    ],
  )
  const dashboardActions = useMemo(
    () => ({
      onCreateWeeklyReport: createWeeklyReport,
    }),
    [createWeeklyReport],
  )

  function scrollChatToBottom(behavior = 'smooth') {
    const chatThread = chatThreadRef.current
    const messagesEnd = messagesEndRef.current

    if (!chatThread || !messagesEnd) {
      return
    }

    const bottomOffset = messagesEnd.offsetTop + messagesEnd.offsetHeight

    chatThread.scrollTo({
      top: Math.max(bottomOffset - chatThread.clientHeight, 0),
      behavior,
    })
  }

  useEffect(() => {
    let cancelled = false

    async function loadAuthSession() {
      setAuthLoading(true)

      if (!authStatus.authEnabled) {
        setAuthSession(null)
        setAuthLoading(false)
        return
      }

      const { data, error } = await getCurrentAuthSession()

      if (cancelled) {
        return
      }

      if (error) {
        setAuthError(getAuthErrorMessage(error))
      } else {
        setAuthError('')
        setAuthSession(data?.session ?? null)
      }

      setAuthLoading(false)
    }

    void loadAuthSession()

    const unsubscribe = subscribeToAuthChanges((session) => {
      setAuthError('')
      setAuthNotice('')
      setAuthSession(session)
      setAuthLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authStatus.authEnabled])

  useEffect(() => {
    userDataRepository.saveWeights(weights)
  }, [weights])

  useEffect(() => {
    userDataRepository.saveBodyMeasurements(bodyMeasurements)
  }, [bodyMeasurements])

  useEffect(() => {
    userDataRepository.saveProgressGoalSettings(progressGoalSettings)
  }, [progressGoalSettings])

  useEffect(() => {
    userDataRepository.saveProgressReports(progressReports)
  }, [progressReports])

  useEffect(() => {
    userDataRepository.saveProgressInsightsSeen(progressInsights.map((insight) => insight.type))
  }, [progressInsights])

  useEffect(() => {
    userDataRepository.saveFoods(foods)
  }, [foods])

  useEffect(() => {
    userDataRepository.saveMeals(meals)
  }, [meals])

  useEffect(() => {
    userDataRepository.saveNutritionGoals(nutritionGoals)
  }, [nutritionGoals])

  useEffect(() => {
    userDataRepository.saveFavoriteMeals(favoriteMeals)
  }, [favoriteMeals])

  useEffect(() => {
    setMealHistory(photoMeals)
  }, [photoMeals])

  useEffect(() => {
    userDataRepository.saveScannedProducts(scannedProducts)
  }, [scannedProducts])

  useEffect(() => {
    userDataRepository.saveProgressPhotos(progressPhotos)
  }, [progressPhotos])

  useEffect(() => {
    userDataRepository.saveReminderSettings(reminderSettings)
  }, [reminderSettings])

  useEffect(() => {
    userDataRepository.saveCoachChat(chatMessages)
  }, [chatMessages])

  useEffect(() => {
    userDataRepository.saveAiCoachReports(coachReports)
  }, [coachReports])

  useEffect(() => {
    function refreshBodyAnalysisHistory() {
      setBodyAnalysisHistory(getAnalysisHistory())
    }

    window.addEventListener(
      bodyAnalysisHistoryChangedEvent,
      refreshBodyAnalysisHistory,
    )

    return () => {
      window.removeEventListener(
        bodyAnalysisHistoryChangedEvent,
        refreshBodyAnalysisHistory,
      )
    }
  }, [])

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      scrollChatToBottom()
    })
    const timeout = window.setTimeout(() => {
      scrollChatToBottom()
    }, 80)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeout)
    }
  }, [chatMessages])

  useEffect(() => {
    userDataRepository.saveCheckIn(checkIn)
  }, [checkIn])

  useEffect(() => {
    if (profile) {
      userDataRepository.saveProfile(profile)
    }
  }, [profile])

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }

      if (barcodeTimerRef.current) {
        window.clearInterval(barcodeTimerRef.current)
      }

      if (barcodeStreamRef.current) {
        barcodeStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    },
    [],
  )

  useEffect(() => {
    if (!reminderSettings.enabled || !('Notification' in window)) {
      return undefined
    }

    const reminderTypes = [
      {
        enabled: reminderSettings.weight,
        key: 'weight',
        message: 'Dags att logga dagens vikt i Viktkollen.',
        time: reminderSettings.weightTime,
        title: 'Viktpåminnelse',
      },
      {
        enabled: reminderSettings.meal,
        key: 'meal',
        message: 'Lägg in en snabb måltidsnotering när du har ätit.',
        time: reminderSettings.mealTime,
        title: 'Måltidspåminnelse',
      },
      {
        enabled: reminderSettings.water,
        key: 'water',
        message: 'Ta ett glas vatten och kryssa vattenmålet om det passar.',
        time: reminderSettings.waterTime,
        title: 'Vattenpåminnelse',
      },
    ]

    const intervalId = window.setInterval(() => {
      if (window.Notification.permission !== 'granted') {
        return
      }

      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5)
      const today = now.toLocaleDateString('sv-SE')
      const sentLog = userDataRepository.getReminderLog(
        {},
        (value) => Boolean(value && typeof value === 'object'),
      )

      reminderTypes.forEach((reminder) => {
        const logKey = `${today}-${reminder.key}`

        if (reminder.enabled && reminder.time === currentTime && !sentLog[logKey]) {
          new window.Notification(reminder.title, {
            body: reminder.message,
          })
          sentLog[logKey] = true
        }
      })

      userDataRepository.saveReminderLog(sentLog)
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [reminderSettings])

  useEffect(() => {
    let cancelled = false

    if (!authSession || showOnboarding) {
      return () => {
        cancelled = true
      }
    }

    async function loadDailyCoach() {
      const result = await requestAiEndpoint({
        action: 'daily-coach',
        profile: makeValidatedProfile(profile),
        checkIn,
        foods,
        meals,
        weights,
        currentWeight: latestWeight.value,
      })
      const data = result.data || {}

      if (!cancelled && result.ok && typeof data.summary === 'string' && data.summary.trim()) {
        setDailyCoachResult({
          key: dailyCoachKey,
          source: data.source === 'openai' ? 'openai' : 'mock',
          summary: data.summary.trim(),
        })
        return
      }

      if (!cancelled) {
        setDailyCoachResult({
          key: dailyCoachKey,
          source: 'mock',
          summary: '',
        })
      }
    }

    void loadDailyCoach()

    return () => {
      cancelled = true
    }
  }, [
    checkIn,
    dailyCoachKey,
    authSession,
    foods,
    latestWeight.value,
    meals,
    profile,
    showOnboarding,
    weights,
  ])

  useEffect(() => {
    let cancelled = false
    const coachData = {
      bodyAnalysisHistory,
      checkIn,
      mealHistory: photoMeals,
      meals,
      weights,
    }

    async function loadProactiveCoach() {
      const insights = await getProactiveCoachInsights(coachData)

      if (!cancelled) {
        setProactiveCoachResult({
          insights,
          key: proactiveCoachKey,
        })
      }
    }

    void loadProactiveCoach()

    return () => {
      cancelled = true
    }
  }, [bodyAnalysisHistory, checkIn, meals, photoMeals, proactiveCoachKey, weights])

  function updateProfileForm(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value }))
  }

  function saveProfile(event) {
    event.preventDefault()
    setProfileError('')

    const nextProfile = {
      ...profileForm,
      name: profileForm.name.trim(),
      startWeight: profileForm.startWeight.trim(),
      goalWeight: profileForm.goalWeight.trim(),
    }

    if (!nextProfile.name) {
      setProfileError('Ange ditt namn.')
      return
    }

    if (
      !isValidWeightInput(nextProfile.startWeight) ||
      !isValidWeightInput(nextProfile.goalWeight)
    ) {
      setProfileError('Startvikt och målvikt måste vara giltiga siffror.')
      return
    }

    const normalizedProfile = {
      ...nextProfile,
      startWeight: formatDecimal(parseWeight(nextProfile.startWeight)),
      goalWeight: formatDecimal(parseWeight(nextProfile.goalWeight)),
    }

    setProfile(normalizedProfile)
    setProfileForm(normalizedProfile)
    setShowOnboarding(false)
  }

  async function handleSignIn(credentials) {
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    const { data, error } = await signInWithEmail(credentials)

    if (error) {
      setAuthError(getAuthErrorMessage(error))
    } else {
      setAuthSession(data?.session ?? null)
    }

    setAuthLoading(false)
  }

  async function handleSignUp(credentials) {
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    const { data, error } = await signUpWithEmail(credentials)

    if (error) {
      setAuthError(getAuthErrorMessage(error))
    } else {
      setAuthSession(data?.session ?? null)
      setAuthNotice(
        data?.session
          ? ''
          : 'Kontot skapades. Kontrollera din e-post om Supabase kräver bekräftelse.',
      )
    }

    setAuthLoading(false)
  }

  async function handleSignOut() {
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)

    const { error } = await signOut()

    if (error) {
      setAuthError(getAuthErrorMessage(error))
    } else {
      setAuthSession(null)
    }

    setAuthLoading(false)
  }

  function updateCheckIn(key, value) {
    setCheckIn((current) => ({ ...current, [key]: value }))
  }

  function toggleFood(id) {
    setFoods((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    )
  }

  function handleFoodPhotoChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        setFoodPhotoPreview(reader.result)
      }
    })
    reader.readAsDataURL(file)
  }

  async function requestMealAnalysis(image) {
    return analyzeMealPhoto({
      checkIn,
      foods,
      image,
      meals,
      profile: getValidatedProfile(),
    })
  }

  async function analyzePhotoMeal() {
    if (!foodPhotoPreview) {
      return
    }

    setPhotoAnalysisStatus('Analyserar måltid...')
    const analysis = await requestMealAnalysis(foodPhotoPreview)
    const createdAt = new Date().toISOString()
    const nextEntry = {
      analysis,
      createdAt,
      id: new Date(createdAt).getTime(),
      image: foodPhotoPreview,
      source: analysis.source || 'mock',
    }
    const photoMeal = mealDraftToMeal({
      calories: analysis.calories,
      carbs: analysis.carbs,
      date: getNutritionTodayDateString(),
      description:
        analysis.summary ||
        `Fotoanalys: ${Array.isArray(analysis.foods) ? analysis.foods.join(', ') : 'måltid'}`,
      fat: analysis.fat,
      fiber: analysis.fiber,
      name: analysis.mealType ? `${analysis.mealType} från foto` : 'Måltid från foto',
      note: analysis.coachSummary || analysis.improvement || analysis.improvementSuggestion || '',
      portionSize: analysis.portionSize || analysis.portionEstimate || '',
      protein: analysis.protein,
      source: 'Fotoanalys',
      time: new Date(createdAt).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      type: analysis.mealType || 'Lunch',
    })

    setPhotoMeals(addMealAnalysis(nextEntry))
    setMeals((current) => upsertMeal(current, photoMeal))
    setPhotoAnalysisStatus('')
  }

  function exportMealAnalysisHistory() {
    const exportPayload = exportMealHistory()
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `viktkollen-mathistorik-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  function importMealAnalysisHistory(event) {
    const file = event.target.files?.[0]

    if (!file) {
      setPhotoAnalysisStatus('Ingen importfil valdes.')
      return
    }

    const reader = new FileReader()

    reader.addEventListener('load', () => {
      try {
        const importResult = importMealHistory(JSON.parse(String(reader.result)))

        setPhotoMeals(importResult.history)
        setMealHistoryImportSummary(importResult.summary)
        setPhotoAnalysisStatus('Mathistorik importerad.')
      } catch {
        setPhotoAnalysisStatus(
          'Importen misslyckades. Kontrollera att filen är en exporterad JSON-fil från Viktkollen.',
        )
      } finally {
        event.target.value = ''
      }
    })
    reader.readAsText(file)
  }

  function clearLocalMealHistory() {
    setPhotoMeals(clearMealHistory())
    setMealHistoryImportSummary(null)
    setShowClearMealHistoryConfirm(false)
    setPhotoAnalysisStatus('Mathistoriken har rensats.')
  }

  function createDemoMealAnalysisDay() {
    const nextHistory = setMealHistory([...createDemoMealDay(), ...photoMeals])

    setPhotoMeals(nextHistory)
    setMealHistoryImportSummary(null)
    setPhotoAnalysisStatus('Demo-måltidsdag skapad.')
  }

  function saveScannedProduct(barcode) {
    const normalizedBarcode = barcode.trim()

    if (!normalizedBarcode) {
      setBarcodeStatus('Ange eller skanna en streckkod först.')
      return
    }

    const product = makeProductFromBarcode(normalizedBarcode)

    setScannedProducts((current) => [
      product,
      ...current.filter((item) => item.barcode !== normalizedBarcode).slice(0, 9),
    ])
    setBarcodeInput('')
    setBarcodeStatus('Produkt sparad lokalt.')
  }

  function stopBarcodeScanner() {
    if (barcodeTimerRef.current) {
      window.clearInterval(barcodeTimerRef.current)
      barcodeTimerRef.current = null
    }

    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((track) => track.stop())
      barcodeStreamRef.current = null
    }

    if (barcodeVideoRef.current) {
      barcodeVideoRef.current.srcObject = null
    }

    setBarcodeScannerActive(false)
  }

  async function startBarcodeScanner() {
    if (!('BarcodeDetector' in window)) {
      setBarcodeStatus(
        'Kameraskanning stöds inte i den här webbläsaren. Skriv koden manuellt.',
      )
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeStatus('Kameran är inte tillgänglig. Skriv koden manuellt.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      })

      barcodeStreamRef.current = stream

      if (barcodeVideoRef.current) {
        barcodeVideoRef.current.srcObject = stream
        await barcodeVideoRef.current.play()
      }

      setBarcodeScannerActive(true)
      setBarcodeStatus('Rikta kameran mot streckkoden.')

      barcodeTimerRef.current = window.setInterval(async () => {
        if (!barcodeVideoRef.current) {
          return
        }

        try {
          const codes = await detector.detect(barcodeVideoRef.current)
          const barcode = codes[0]?.rawValue

          if (barcode) {
            saveScannedProduct(barcode)
            stopBarcodeScanner()
          }
        } catch {
          setBarcodeStatus('Kunde inte läsa streckkoden ännu. Försök hålla kameran stilla.')
        }
      }, 900)
    } catch (error) {
      setBarcodeStatus(
        error instanceof Error
          ? `Kameran kunde inte startas: ${error.message}`
          : 'Kameran kunde inte startas.',
      )
    }
  }

  function submitManualBarcode(event) {
    event.preventDefault()
    saveScannedProduct(barcodeInput)
  }

  function handleProgressPhotoChange(event, view) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        const photo = {
          id: Date.now(),
          image: reader.result,
          createdAt: new Date().toISOString(),
          note: progressPhotoNote.trim(),
          weight: latestWeight.value,
          view,
        }

        setProgressPhotos((current) => [photo, ...current])
        setAfterPhotoId(String(photo.id))
        setProgressPhotoNote('')
        event.target.value = ''
      }
    })
    reader.readAsDataURL(file)
  }

  function updateReminderSetting(key, value) {
    setReminderSettings((current) => ({ ...current, [key]: value }))
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      setReminderStatus('Webbläsaren stödjer inte notiser.')
      return
    }

    const permission = await window.Notification.requestPermission()

    if (permission === 'granted') {
      setReminderStatus('Notiser är aktiverade.')
      setReminderSettings((current) => ({ ...current, enabled: true }))
      return
    }

    setReminderStatus('Notiser är inte aktiverade. Inställningarna sparas ändå.')
  }

  function getValidatedProfile() {
    return makeValidatedProfile(profile)
  }

  function createLocalSmartChatReply(message, chatHistory) {
    try {
      const intent = classifyAiCoachIntent({
        chatHistory,
        message,
      })
      const context = buildAiCoachContext({
        bodyAnalysisHistory,
        chatHistory,
        checkIn,
        currentWeight: latestWeight.value,
        foods,
        intent: intent.intent,
        latestCoachReply: chatHistory
          .filter((chatMessage) => chatMessage.role === 'assistant')
          .at(-1)?.text || '',
        latestWeeklyReport: weeklyReportData,
        mealHistory: getMealHistory(),
        meals,
        profile: getValidatedProfile(),
        weights,
      })

      return {
        reply: createLocalAiCoachReply({
          context,
          intent,
          message,
        }),
        source: 'mock',
      }
    } catch {
      return {
        reply: makeChatResponse(
          message,
          profile,
          checkIn,
          foods,
          latestWeight.value,
          chatHistory,
          weights,
          meals,
        ),
        source: 'mock',
      }
    }
  }

  async function requestChatReply(message) {
    const recentChatHistory = chatMessages.slice(-10).map((chatMessage) => ({
      role: chatMessage.role,
      text: chatMessage.text,
    }))

    const apiResult = await requestAiEndpoint({
      action: 'chat',
      message,
      profile: getValidatedProfile(),
      checkIn,
      foods,
      meals,
      mealHistory: getMealHistory(),
      bodyAnalysisHistory,
      latestWeeklyReport: weeklyReportData,
      latestCoachReply: recentChatHistory
        .filter((chatMessage) => chatMessage.role === 'assistant')
        .at(-1)?.text || '',
      userContext: aiUserContext,
      weights,
      currentWeight: latestWeight.value,
      chatHistory: recentChatHistory,
    })
    const data = apiResult.data || {}

    if (apiResult.ok && typeof data.reply === 'string' && data.reply.trim()) {
      return {
        reply: data.reply.trim(),
        source: data.source,
      }
    }

    return createLocalSmartChatReply(
      message,
      recentChatHistory,
    )
  }

  function appendChatMessage(role, text, source = '') {
    setChatMessages((current) => [
      ...current,
      {
        createdAt: new Date().toISOString(),
        id: current.length + 1,
        role,
        source,
        text,
      },
    ])
  }

  function clearChat() {
    setChatMessages(initialChatMessages)
    setChatInput('')
    setChatEngineStatus('')
    setVoiceStatus('')
  }

  async function sendChatText(text) {
    appendChatMessage('user', text)
    addAiConversationMemory({
      feature: 'ai-coach',
      role: 'user',
      text,
    })
    const result = await requestChatReply(text)
    const isLocalFallback = result.source !== 'openai'

    setChatEngineStatus(
      isLocalFallback
        ? 'AI-coachen använder lokal fallback just nu.'
        : '',
    )
    appendChatMessage('assistant', result.reply, result.source)
    addAiConversationMemory({
      feature: 'ai-coach',
      role: 'assistant',
      text: result.reply,
    })
  }

  function submitChatText(text) {
    const trimmedText = text.trim()

    if (!trimmedText) {
      return
    }

    setChatInput('')
    void sendChatText(trimmedText)
  }

  function sendChatMessage(event) {
    event.preventDefault()
    submitChatText(chatInput)
  }

  async function startVoiceInput() {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      setVoiceStatus('Lyssningen stoppades.')
      return
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceStatus(
        'Röstinmatning stöds inte i den här webbläsaren. Skriv frågan i stället.',
      )
      return
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setVoiceStatus(
        'Mikrofonen kräver oftast HTTPS. Testa i en säker webbläsarsession.',
      )
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus('Mikrofonen är inte tillgänglig i den här webbläsaren.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setVoiceStatus(
          'Mikrofonbehörighet nekades. Tillåt mikrofon i webbläsaren och försök igen.',
        )
        return
      }

      if (
        error instanceof DOMException &&
        (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError')
      ) {
        setVoiceStatus('Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frågan.')
        return
      }

      setVoiceStatus('Mikrofonen kunde inte starta. Försök igen eller skriv frågan.')
      return
    }

    const recognition = new SpeechRecognition()
    let hasTranscript = false
    let hasSubmittedTranscript = false

    recognitionRef.current?.abort()
    recognitionRef.current = recognition

    recognition.lang = 'sv-SE'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.addEventListener('start', () => {
      setIsListening(true)
      setVoiceStatus('Lyssnar...')
    })

    recognition.addEventListener('result', (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()

      if (transcript) {
        if (hasSubmittedTranscript) {
          return
        }

        hasTranscript = true
        hasSubmittedTranscript = true
        setChatInput(transcript)
        setVoiceStatus('Skickar meddelandet...')

        window.requestAnimationFrame(() => {
          submitChatText(transcript)
        })
      }
    })

    recognition.addEventListener('error', (event) => {
      setIsListening(false)

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceStatus(
          'Mikrofonbehörighet nekades. Tillåt mikrofon i webbläsaren och försök igen.',
        )
        return
      }

      if (event.error === 'no-speech') {
        setVoiceStatus('Jag hörde inget. Tryck på mikrofonen och försök igen.')
        return
      }

      if (event.error === 'audio-capture') {
        setVoiceStatus('Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frågan.')
        return
      }

      setVoiceStatus('Kunde inte lyssna just nu. Försök igen eller skriv frågan.')
    })

    recognition.addEventListener('end', () => {
      setIsListening(false)

      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }

      setVoiceStatus((current) => {
        if (current !== 'Lyssnar...') {
          return current
        }

        return hasTranscript
          ? 'Texten är ifylld. Du kan redigera innan du skickar.'
          : 'Jag hörde inget. Tryck på mikrofonen och försök igen.'
      })
    })

    try {
      recognition.start()
      setIsListening(true)
      setVoiceStatus('Lyssnar...')
    } catch (error) {
      recognitionRef.current = null
      setIsListening(false)
      setVoiceStatus(
        error instanceof Error
          ? `Mikrofonen kunde inte starta: ${error.message}`
          : 'Mikrofonen kunde inte starta. Försök igen eller skriv frågan.',
      )
    }
  }

  function handleStarterPrompt(prompt) {
    void sendChatText(prompt)
  }

  if (authLoading) {
    return (
      <main className="app-shell welcome-shell">
        <section className="welcome-card">
          <p className="eyebrow">Viktkollen Auth</p>
          <h1>Kontrollerar inloggning</h1>
          <p className="welcome-subtitle">
            Väntar på Supabase-session...
          </p>
        </section>
      </main>
    )
  }

  if (!authSession) {
    return (
      <AuthPanel
        authError={authError}
        authLoading={authLoading}
        authNotice={authNotice}
        authStatus={authStatus}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
      />
    )
  }

  if (showOnboarding) {
    return (
      <main className="app-shell onboarding-shell">
        <section className="onboarding-card">
          <p className="eyebrow">Välkommen till Viktkollen</p>
          <h1>Skapa din profil</h1>
          <p className="onboarding-copy">
            Svara på några snabba frågor så anpassar vi dashboarden efter ditt
            mål. All data sparas bara lokalt i din webbläsare.
          </p>

          <form className="onboarding-form" onSubmit={saveProfile}>
            <label className="field">
              <span>Namn</span>
              <input
                type="text"
                value={profileForm.name}
                onChange={(event) =>
                  updateProfileForm('name', event.target.value)
                }
                placeholder="Ditt namn"
                required
              />
            </label>

            <label className="field">
              <span>Mål</span>
              <select
                value={profileForm.goal}
                onChange={(event) =>
                  updateProfileForm('goal', event.target.value)
                }
              >
                {goalOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            <div className="onboarding-row">
              <label className="field">
                <span>Startvikt</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={profileForm.startWeight}
                  onChange={(event) =>
                    updateProfileForm('startWeight', event.target.value)
                  }
                  placeholder="Ex. 91,8"
                  required
                />
              </label>

              <label className="field">
                <span>Målvikt</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={profileForm.goalWeight}
                  onChange={(event) =>
                    updateProfileForm('goalWeight', event.target.value)
                  }
                  placeholder="Ex. 84,0"
                  required
                />
              </label>
            </div>

            <label className="field">
              <span>Aktivitetsnivå</span>
              <select
                value={profileForm.activityLevel}
                onChange={(event) =>
                  updateProfileForm('activityLevel', event.target.value)
                }
              >
                {activityOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            {profileError && (
              <p className="form-error" role="alert">
                {profileError}
              </p>
            )}

            <button type="submit">Spara och fortsätt</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar" id="hem">
        <div>
          <p className="eyebrow">Viktkollen MVP</p>
          <h1>
            {profile?.name ? `Hej ${profile.name}` : 'Coach för träning, mat och vanor'}
          </h1>
          <p className="profile-summary">
            {profileSummaryParts.join(' · ')}
          </p>
        </div>
        <div className="topbar-actions">
          <p className="welcome-note">
            Inloggad som {authSession.user?.email || 'okänd e-post'}
          </p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowOnboarding(true)}
          >
            Ändra profil
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleSignOut}
            disabled={authLoading}
          >
            Logga ut
          </button>
          <p className="disclaimer">
            Den här appen ger endast allmänt stöd för hälsa och välmående. Den är
            inte medicinsk rådgivning, diagnos eller behandling.
          </p>
        </div>
      </header>

      <Dashboard actions={dashboardActions} dashboard={dashboardData} />

      <CloudStatusPanel isAuthenticated={Boolean(authSession)} />

      <section className="content-grid">
        <ProgressCenter
          bodyAnalysisHistory={bodyAnalysisHistory}
          bodyMeasurements={bodyMeasurements}
          goalSettings={progressGoalSettings}
          onBodyMeasurementsChange={(nextMeasurements) =>
            setBodyMeasurements(normalizeBodyMeasurements(nextMeasurements))}
          onGoalSettingsChange={(nextSettings) =>
            setProgressGoalSettings(normalizeGoalSettings(nextSettings))}
          onProgressReportsChange={setProgressReports}
          onWeightsChange={(nextWeights) => setWeights(normalizeWeights(nextWeights))}
          profile={makeValidatedProfile(profile)}
          progressPhotos={progressPhotos}
          progressReports={progressReports}
          weights={weights}
        />

        <ChatPanel
          canClearChat={chatMessages.length > initialChatMessages.length}
          chatInput={chatInput}
          chatMessages={chatMessages}
          chatThreadRef={chatThreadRef}
          isListening={isListening}
          messagesEndRef={messagesEndRef}
          onChatInputChange={setChatInput}
          onClearChat={clearChat}
          onSendChatMessage={sendChatMessage}
          onStartVoiceInput={startVoiceInput}
          onStarterPrompt={handleStarterPrompt}
          starterPrompts={aiStarterPrompts}
          chatEngineStatus={chatEngineStatus}
          voiceStatus={voiceStatus}
        />

        <AICoach
          coachMessage={coachMessage}
          coachReport={latestCoachReport || currentCoachPreview}
          coachReports={coachReports}
          coachStatus={coachStatus}
          isGeneratingReport={isGeneratingCoachReport}
          onClearCoachReports={clearCoachReports}
          onCreateCoachReport={createCoachReport}
          onDeleteCoachReport={deleteCoachReport}
        />

        <article className="panel" id="mat">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Matchecklista</p>
              <h2>Grunder för maten</h2>
            </div>
          </div>
          <div className="checklist">
            {foods.map((item) => (
              <label className="toggle-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleFood(item.id)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </article>

        <CheckIn
          checkIn={checkIn}
          foodScore={foodScore}
          foodTotal={foods.length}
          onUpdateCheckIn={updateCheckIn}
        />

        <MealLogger
          displayPhotoMeals={displayPhotoMeals}
          favoriteMeals={favoriteMeals}
          foodPhotoPreview={foodPhotoPreview}
          handleFoodPhotoChange={handleFoodPhotoChange}
          importSummary={mealHistoryImportSummary}
          meals={meals}
          onAnalyzePhotoMeal={analyzePhotoMeal}
          onCancelClearMealHistory={() => setShowClearMealHistoryConfirm(false)}
          onClearMealHistory={clearLocalMealHistory}
          onCreateDemoMealDay={createDemoMealAnalysisDay}
          onExportMealHistory={exportMealAnalysisHistory}
          onFavoriteMealsChange={(nextFavorites) =>
            setFavoriteMeals(normalizeFavoriteMeals(nextFavorites))}
          onImportMealHistory={importMealAnalysisHistory}
          onMealsChange={(nextMeals) => setMeals(normalizeMeals(nextMeals))}
          onNutritionGoalsChange={(nextGoals) =>
            setNutritionGoals(normalizeNutritionGoals(nextGoals))}
          onSelectedMealDateChange={setSelectedMealDate}
          onShowClearMealHistory={() => setShowClearMealHistoryConfirm(true)}
          nutritionGoals={nutritionGoals}
          photoAnalysisStatus={photoAnalysisStatus}
          selectedMealDate={selectedMealDate}
          showClearMealHistoryConfirm={showClearMealHistoryConfirm}
          weekSummary={mealWeekSummary}
        />

        <BarcodeScanner
          barcodeInput={barcodeInput}
          barcodeScannerActive={barcodeScannerActive}
          barcodeStatus={barcodeStatus}
          barcodeVideoRef={barcodeVideoRef}
          onBarcodeInputChange={setBarcodeInput}
          onStartBarcodeScanner={startBarcodeScanner}
          onStopBarcodeScanner={stopBarcodeScanner}
          onSubmitManualBarcode={submitManualBarcode}
          scannedProducts={scannedProducts}
        />

        <ProgressPhotos
          afterPhotoId={afterPhoto ? String(afterPhoto.id) : ''}
          beforeAfterPhotos={beforeAfterPhotos}
          beforePhotoId={beforePhoto ? String(beforePhoto.id) : ''}
          hasProgressPhotos={progressPhotos.length > 0}
          onAfterPhotoIdChange={setAfterPhotoId}
          onBeforePhotoIdChange={setBeforePhotoId}
          onDeleteProgressPhoto={(photoId) => {
            if (window.confirm('Vill du ta bort den här framstegsbilden?')) {
              setProgressPhotos((current) => current.filter((photo) => photo.id !== photoId))
            }
          }}
          onProgressPhotoChange={handleProgressPhotoChange}
          onProgressPhotoNoteChange={setProgressPhotoNote}
          onUpdateProgressPhoto={(photoId, updates) =>
            setProgressPhotos((current) =>
              current.map((photo) =>
                photo.id === photoId ? { ...photo, ...updates, updatedAt: new Date().toISOString() } : photo,
              ))}
          progressPhotoComparison={progressPhotoComparison}
          progressPhotoComparisonImages={progressPhotoComparisonImages}
          progressPhotoCountLabel={`${progressPhotos.length} sparade bilder`}
          progressPhotoItems={progressPhotoItems}
          progressPhotoNote={progressPhotoNote}
          progressPhotoOptions={progressPhotoOptions}
        />

        <ReminderSettings
          onReminderSettingChange={updateReminderSetting}
          onRequestNotificationPermission={requestNotificationPermission}
          reminderOptions={reminderOptions}
          reminderSettings={reminderSettings}
          reminderStatus={reminderStatus}
        />

        <CloudBackupPanel isAuthenticated={Boolean(authSession)} />

        <MonthlyReport report={monthlyReport} />

        <article className="panel trends-panel" id="framsteg">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Framsteg</p>
              <h2>Trender</h2>
            </div>
          </div>
          <div className="trend-list">
            <div>
              <span>Viktutveckling</span>
              <strong>{weightChange <= 0 ? 'Nedåt' : 'Uppåt'}</strong>
            </div>
            <div>
              <span>Matvanor</span>
              <strong>{Math.round((foodScore / foods.length) * 100)}%</strong>
            </div>
            <div>
              <span>Aktivitet</span>
              <strong>{checkIn.steps >= 7000 ? 'På rätt väg' : 'Behöver fler steg'}</strong>
            </div>
          </div>
          <WeeklyReport
            onCreateWeeklyReport={createWeeklyReport}
            weeklyReportData={weeklyReportData}
            weeklyReportLines={weeklyReportLines}
            weeklyReportStatus={weeklyReportStatus}
          />
        </article>
      </section>

      <nav className="bottom-nav" aria-label="Huvudnavigation">
        <a href="#hem" aria-label="Gå till översikt">
          <span>⌂</span>
          <strong>Hem</strong>
        </a>
        <a href="#checkin" aria-label="Gå till dagens check-in">
          <span>✓</span>
          <strong>Check</strong>
        </a>
        <a href="#vikt" aria-label="Gå till viktloggen">
          <span>↗</span>
          <strong>Vikt</strong>
        </a>
        <a href="#mat" aria-label="Gå till matchecklistan">
          <span>+</span>
          <strong>Mat</strong>
        </a>
        <a href="#framstegsbilder" aria-label="Gå till framstegsbilder">
          <span>□</span>
          <strong>Foto</strong>
        </a>
        <a href="#manadsrapport" aria-label="Gå till månadsrapport">
          <span>30</span>
          <strong>Rapport</strong>
        </a>
        <a href="#installningar" aria-label="Gå till inställningar">
          <span>⚙</span>
          <strong>Mer</strong>
        </a>
      </nav>
    </main>
  )
}

export default App
