import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import AICoach from './components/AICoach.jsx'
import BarcodeScanner from './components/BarcodeScanner.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import CheckIn from './components/CheckIn.jsx'
import MealLogger from './components/MealLogger.jsx'
import ProactiveCoachCard from './components/ProactiveCoachCard.jsx'
import ProgressPhotos from './components/ProgressPhotos.jsx'
import ReminderSettings from './components/ReminderSettings.jsx'
import WeightChart from './components/WeightChart.jsx'
import WeeklyReport from './components/WeeklyReport.jsx'
import { makePersonalCoachReply } from './lib/coachReply.js'
import { getAnalysisHistory } from './services/bodyAnalysisHistory.js'
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
import { getProactiveCoachInsights, makeProactiveCoachInsights } from './services/proactiveCoachService.js'
import { createWeeklyReport as createAiWeeklyReport } from './services/weeklyReportService.js'

const starterWeights = [
  { date: '2026-05-23', value: 91.8 },
  { date: '2026-05-24', value: 91.2 },
  { date: '2026-05-25', value: 90.9 },
  { date: '2026-05-26', value: 90.4 },
  { date: '2026-05-27', value: 90.1 },
]

const initialFoods = [
  { id: 'protein', label: 'Protein till varje mÃ¥ltid (20-30 g)', done: true },
  { id: 'veg', label: 'Frukt eller grÃ¶nsaker', done: true },
  { id: 'water', label: 'VattenmÃ¥l', done: false },
  { id: 'snack', label: 'Planerat mellanmÃ¥l', done: false },
]

const initialMeals = [
  { id: 1, type: 'Frukost', text: 'Grekisk yoghurt, bÃ¤r och havre' },
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
    text: 'Hej! FrÃ¥ga mig om mat, vanor eller motivation sÃ¥ hÃ¥ller jag svaret kort och konkret.',
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
  goal: 'gÃ¥ ner i vikt',
  startWeight: '',
  goalWeight: '',
  activityLevel: 'Medel',
}

const mealOptions = ['Frukost', 'Lunch', 'Middag', 'MellanmÃ¥l']

const goalOptions = ['gÃ¥ ner i vikt', 'hÃ¥lla vikten', 'bygga muskler']

const activityOptions = ['LÃ¥g', 'Medel', 'HÃ¶g']

const starterPrompts = [
  'Vad ska jag Ã¤ta ikvÃ¤ll?',
  'Ge mig ett hÃ¤lsosamt mellanmÃ¥l',
  'Hur hÃ¥ller jag motivationen?',
  'Billig proteinrik lunch?',
]

const chartRangeOptions = [
  { label: '7 dagar', value: '7' },
  { label: '30 dagar', value: '30' },
  { label: 'All tid', value: 'all' },
]

const storageKeys = {
  chat: 'viktkollen.chat',
  checkIn: 'viktkollen.checkIn',
  demoMode: 'viktkollen.demoMode',
  foods: 'viktkollen.foods',
  meals: 'viktkollen.meals',
  photoMeals: 'viktkollen.photoMeals',
  profile: 'viktkollen.profile',
  progressPhotos: 'viktkollen.progressPhotos',
  reminders: 'viktkollen.reminders',
  reminderLog: 'viktkollen.reminderLog',
  scannedProducts: 'viktkollen.scannedProducts',
  weights: 'viktkollen.weights',
}

function isStoredWeights(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (entry) =>
        entry &&
        typeof entry.date === 'string' &&
        Number.isFinite(entry.value),
    )
  )
}

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
          entry.view === 'side'),
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

function isStoredBoolean(value) {
  return typeof value === 'boolean'
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

function readStoredValue(key, fallback, isValid) {
  try {
    const storedValue = window.localStorage.getItem(key)

    if (!storedValue) {
      return fallback
    }

    const parsedValue = JSON.parse(storedValue)
    return isValid(parsedValue) ? parsedValue : fallback
  } catch {
    return fallback
  }
}

function readStoredFoods() {
  const storedFoods = readStoredValue(storageKeys.foods, [], Array.isArray)

  return initialFoods.map((item) => {
    const storedItem = storedFoods.find((stored) => stored?.id === item.id)

    return {
      ...item,
      done:
        typeof storedItem?.done === 'boolean' ? storedItem.done : item.done,
    }
  })
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Keep the app usable if private mode or browser settings block storage.
  }
}

function formatDecimal(value) {
  return value.toLocaleString('sv-SE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function formatWeight(value) {
  return `${formatDecimal(value)} kg`
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
    profile?.goal === 'gÃ¥ ner i vikt'
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

function formatDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

function getFilteredWeights(weights, range) {
  const sortedWeights = [...weights].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  )

  if (range === 'all') {
    return sortedWeights
  }

  return sortedWeights.slice(-Number(range))
}

function getAverageWeeklyChange(weights) {
  if (weights.length < 2) {
    return 0
  }

  const first = weights[0]
  const last = weights.at(-1)
  const days = Math.max(
    1,
    (new Date(last.date) - new Date(first.date)) / 86400000,
  )

  return Number((((last.value - first.value) / days) * 7).toFixed(1))
}

function getLinearTrendValues(weights) {
  if (weights.length < 2) {
    return weights.map((entry) => entry.value)
  }

  const count = weights.length
  const sumX = weights.reduce((sum, _, index) => sum + index, 0)
  const sumY = weights.reduce((sum, entry) => sum + entry.value, 0)
  const sumXY = weights.reduce(
    (sum, entry, index) => sum + index * entry.value,
    0,
  )
  const sumXX = weights.reduce((sum, _, index) => sum + index * index, 0)
  const denominator = count * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / count

  return weights.map((_, index) => intercept + slope * index)
}

function getChartPoints(values, minValue, range, width, height, padding) {
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  return values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (index / (values.length - 1)) * usableWidth
    const y = padding + ((range - (value - minValue)) / range) * usableHeight

    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
}

function getTodayDate() {
  return new Date().toLocaleDateString('sv-SE')
}

function getProgressPhotoViewLabel(view) {
  if (view === 'front') {
    return 'framifrÃ¥n'
  }

  if (view === 'side') {
    return 'frÃ¥n sidan'
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
      summary: `LÃ¤gg till en till bild ${viewLabel} fÃ¶r att skapa en fÃ¶rsiktig V2-jÃ¤mfÃ¶relse.`,
      observations: [
        'NÃ¤r tvÃ¥ bilder med samma perspektiv finns kan smÃ¥ visuella fÃ¶rÃ¤ndringar jÃ¤mfÃ¶ras mer rÃ¤ttvist.',
        'FÃ¶rsÃ¶k gÃ¤rna anvÃ¤nda liknande ljus, avstÃ¥nd och hÃ¥llning nÃ¤sta gÃ¥ng.',
      ],
    }
  }

  const perspectiveObservation =
    latestPhoto.view === 'side'
      ? 'Sidoprofilen ser ut att kunna jÃ¤mfÃ¶ras med fÃ¶regÃ¥ende sidobild, men ljus och vinkel kan pÃ¥verka intrycket.'
      : 'MidjeomrÃ¥det och hÃ¥llningen ser ut att kunna jÃ¤mfÃ¶ras med fÃ¶regÃ¥ende bild framifrÃ¥n, men ljus och vinkel kan pÃ¥verka intrycket.'

  return {
    latestPhoto,
    previousPhoto,
    viewLabel,
    summary: `Nyaste bilden ${viewLabel} jÃ¤mfÃ¶rs med fÃ¶regÃ¥ende bild frÃ¥n samma perspektiv.`,
    observations: [
      perspectiveObservation,
      'HÃ¥llningen ser ut att vara relativt lik, men smÃ¥ skillnader i pose kan pÃ¥verka jÃ¤mfÃ¶relsen.',
      'SmÃ¥ visuella fÃ¶rÃ¤ndringar kan anas, men bilden rÃ¤cker inte fÃ¶r att dra sÃ¤kra slutsatser.',
    ],
  }
}

function parseWeight(value) {
  return Number(String(value).replace(',', '.'))
}

function isValidWeightInput(value) {
  const numericValue = parseWeight(value)

  return Number.isFinite(numericValue) && numericValue > 0
}

function makeCoachMessage(profile, checkIn, foods, meals) {
  const completedFoods = foods.filter((item) => item.done).length
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hÃ¥lla en stabil rutin'
  const canDiscussWeightLoss = goal === 'gÃ¥ ner i vikt'
  const canDiscussMuscleGain = goal === 'bygga muskler'
  const focusHint = canDiscussMuscleGain
    ? 'Fokus: protein, styrka och Ã¥terhÃ¤mtning.'
    : canDiscussWeightLoss
      ? 'Fokus: enkla mÃ¥ltider och jÃ¤mn rÃ¶relse.'
      : 'Fokus: stabil energi och upprepbara vanor.'
  const energyHint =
    checkIn.energy >= 7
      ? 'Energin Ã¤r bra: lÃ¤gg in ett pass eller en promenad.'
      : checkIn.energy >= 4
        ? 'Energin Ã¤r okej: hÃ¥ll rutinen enkel.'
        : 'Energin Ã¤r lÃ¥g: vÃ¤lj Ã¥terhÃ¤mtning och en lÃ¤tt mÃ¥ltid.'
  const nutritionHint =
    completedFoods >= 3
      ? 'Matchecklistan ser stark ut.'
      : 'LÃ¤gg till protein eller grÃ¶nsaker i nÃ¤sta mÃ¥ltid.'
  const mealHint =
    meals.length > 0
      ? `${meals.length} mÃ¥ltider loggade i dag.`
      : 'Logga en snabb mÃ¥ltid nÃ¤r du kan.'

  return `${name}, dagens riktning:
â€¢ ${focusHint}
â€¢ ${energyHint}
â€¢ ${nutritionHint}
â€¢ ${mealHint}`
}

function hasBedtimeEatingContext(message, chatHistory = []) {
  const text = [
    ...chatHistory.slice(-4).map((entry) => entry?.text ?? ''),
    message,
  ]
    .join(' ')
    .toLowerCase()

  return (
    (text.includes('lÃ¤gga mig') ||
      text.includes('sova') ||
      text.includes('sover') ||
      text.includes('lÃ¤ggdags') ||
      text.includes('lÃ¤gger mig') ||
      text.includes('innan jag ska lÃ¤gga')) &&
    (text.includes('Ã¤ter') ||
      text.includes('Ã¤ta') ||
      text.includes('Ã¥t') ||
      text.includes('mat'))
  )
}

function asksIfHarmful(message) {
  const text = message.toLowerCase()

  return (
    text.includes('skadligt') ||
    text.includes('farligt') ||
    text.includes('dÃ¥ligt fÃ¶r kroppen') ||
    text.includes('inte bra fÃ¶r kroppen')
  )
}

function asksAboutRapidWeightLoss(message) {
  const text = message.toLowerCase()

  return (
    (text.includes('gÃ¥ ner') ||
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

  return text.includes('sov') || text.includes('sÃ¶mn') || text.includes('sova')
}

function asksAboutFood(message) {
  const text = message.toLowerCase()

  return (
    text.includes('mat') ||
    text.includes('Ã¤ta') ||
    text.includes('Ã¤ter') ||
    text.includes('middag') ||
    text.includes('ikvÃ¤ll')
  )
}

function asksAboutProteinKnowledge(message) {
  const text = message.toLowerCase()

  return (
    text.includes('protein') &&
    (text.includes('hur mycket') ||
      text.includes('hur mÃ¥nga') ||
      text.includes('gram') ||
      text.includes('per dag') ||
      text.includes('om dagen') ||
      text.includes('rekommend') ||
      text.includes('bra fÃ¶r'))
  )
}

function asksForMealSuggestion(message) {
  const text = message.toLowerCase()

  return (
    text.includes('lunch') ||
    text.includes('middag') ||
    text.includes('ikvÃ¤ll') ||
    text.includes('mellanmÃ¥l') ||
    text.includes('vad ska jag Ã¤ta') ||
    text.includes('matfÃ¶rslag') ||
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

  if (text.includes('sov') || text.includes('sÃ¶mn') || text.includes('sova')) {
    return 'FÃ¶r de flesta vuxna Ã¤r 7â€“9 timmars sÃ¶mn en bra riktlinje. 8 timmar Ã¤r alltsÃ¥ ett bra mÃ¥l, men det viktigaste Ã¤r hur du mÃ¥r pÃ¥ dagen och om sÃ¶mnen kÃ¤nns Ã¥terhÃ¤mtande.'
  }

  if (text.includes('stress') || text.includes('stressad')) {
    return 'Stress pÃ¥verkar bÃ¥de energi, hunger och motivation. Testa att sÃ¤nka kraven fÃ¶r resten av dagen: Ã¤t nÃ¥got enkelt, ta fem lugna minuter och vÃ¤lj bara en sak som behÃ¶ver bli gjord. Vad stressar mest just nu?'
  }

  if (text.includes('trÃ¤na') || text.includes('trÃ¤ning') || text.includes('gym') || text.includes('promenad')) {
    return 'Ja, rÃ¶relse Ã¤r oftast en bra idÃ© om kroppen kÃ¤nns okej. HÃ¥ll nivÃ¥n efter dagsformen: promenad om du Ã¤r trÃ¶tt, styrka eller intervaller om du har mer energi. Vad hade du tÃ¤nkt trÃ¤na?'
  }

  if (text.includes('vana') || text.includes('rutin') || text.includes('disciplin')) {
    return 'BÃ¶rja mindre Ã¤n du tycker behÃ¶vs. En vana fastnar lÃ¤ttare om den Ã¤r enkel att upprepa, till exempel samma frukost, en kort promenad eller att logga fÃ¶rsta mÃ¥ltiden. Vilken rutin vill du fÃ¥ ordning pÃ¥?'
  }

  if (text.includes('mat') || text.includes('hungrig') || text.includes('Ã¤ta')) {
    return 'Sikta pÃ¥ nÃ¥got enkelt: protein, en kolhydratkÃ¤lla och frukt eller grÃ¶nsaker. Till exempel Ã¤ggmacka, kyckling med ris eller yoghurt med bÃ¤r. Vill du ha fÃ¶rslag fÃ¶r frukost, lunch eller middag?'
  }

  return ''
}

function makeSleepReply(message) {
  const text = message.toLowerCase()
  const wakeMatch = text.match(/(?:vakna|gÃ¥r upp|gÃ¥r upp|upp)\s*(?:kl\.?|klockan)?\s*(\d{1,2})(?::|\.?)(\d{2})?/)
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

    return `FÃ¶r de flesta vuxna Ã¤r 7-9 timmars sÃ¶mn en bra riktlinje. Om du ska gÃ¥ upp ${formatTime(new Date(0, 0, 0, wakeHour, wakeMinute))} kan ett rimligt sovfÃ¶nster vara ungefÃ¤r ${formatTime(bedtimeStart)}-${formatTime(bedtimeEnd)}. FÃ¶rsÃ¶k hÃ¥lla tiden ganska jÃ¤mn Ã¤ven pÃ¥ vardagar.`
  }

  return 'FÃ¶r de flesta vuxna Ã¤r 7-9 timmars sÃ¶mn en bra riktlinje. 8 timmar Ã¤r ett bra mÃ¥l, men fÃ¶rsÃ¶k framfÃ¶r allt ha en ganska konsekvent lÃ¤ggtid och se hur pigg du Ã¤r dagen efter.'
}

function makeRapidWeightLossReply() {
  return 'Att gÃ¥ ner 2 kg pÃ¥ en vecka kan hÃ¤nda, men mycket Ã¤r ofta vÃ¤tska och det kan vara svÃ¥rt att behÃ¥lla. Sikta hellre pÃ¥ vanor som gÃ¥r att upprepa: protein i varje mÃ¥ltid, mycket grÃ¶nsaker, lagom portioner, vardagsrÃ¶relse och bra sÃ¶mn. Undvik extrem svÃ¤lt eller hÃ¥rd kompensation. Vill du kan jag gÃ¶ra en enkel 7-dagars plan som Ã¤r rimlig och inte extrem.'
}

function makeBedtimeEatingReply() {
  return 'FÃ¶r de flesta Ã¤r det inte skadligt att Ã¤ta nÃ¤ra lÃ¤ggdags. Det kan dÃ¤remot pÃ¥verka sÃ¶mn, reflux, hungervanor eller gÃ¶ra det lÃ¤ttare att Ã¤ta mer Ã¤n man tÃ¤nkt. Om du Ã¤r hungrig sent, testa nÃ¥got lÃ¤ttare som yoghurt, Ã¤gg, keso eller en liten macka.'
}

function makeProteinKnowledgeReply(message) {
  const text = message.toLowerCase()
  const weightMatch = text.match(/(\d{2,3})(?:\s?kg|\s?kilo)/)
  const bodyWeight = weightMatch ? Number(weightMatch[1]) : null

  if (Number.isFinite(bodyWeight)) {
    const lower = Math.round(bodyWeight * 1.2)
    const upper = Math.round(bodyWeight * 1.6)
    const activeUpper = Math.round(bodyWeight * 2)

    return `FÃ¶r en person som vÃ¤ger ${bodyWeight} kg Ã¤r ett rimligt riktmÃ¤rke ofta cirka ${lower}-${upper} g protein per dag. Om personen styrketrÃ¤nar mycket eller vill bygga muskler kan ungefÃ¤r ${upper}-${activeUpper} g per dag vara mer relevant. FÃ¶rdela gÃ¤rna Ã¶ver 3-4 mÃ¥ltider, till exempel 25-40 g per mÃ¥ltid.`
  }

  return 'Ett vanligt riktmÃ¤rke Ã¤r cirka 1,2-1,6 g protein per kilo kroppsvikt per dag fÃ¶r en aktiv vardag. Vid mycket styrketrÃ¤ning kan behovet ligga hÃ¶gre, ofta runt 1,6-2,0 g/kg. FÃ¶rdela det gÃ¤rna Ã¶ver flera mÃ¥ltider.'
}

function makeMultiPartReply(message, chatHistory = []) {
  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return makeBedtimeEatingReply()
  }

  const parts = []

  if (asksForMealSuggestion(message) || asksAboutFood(message)) {
    parts.push(`Mat idag: vÃ¤lj nÃ¥got enkelt och mÃ¤ttande:
â€¢ Kyckling + potatis + frysta grÃ¶nsaker
â€¢ Ã„ggwrap med keso och vitkÃ¥l
â€¢ Linsgryta med ris`)
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
) {
  const text = message.toLowerCase()
  const goal = profile?.goal || 'hÃ¥lla en stabil rutin'
  const goalWeight = profile?.goalWeight?.trim()
  const canDiscussWeightLoss = goal === 'gÃ¥ ner i vikt'
  const canDiscussMuscleGain = goal === 'bygga muskler'
  const weightContext = canDiscussWeightLoss && goalWeight
    ? `Nuvarande vikt Ã¤r ${formatWeight(currentWeight)} och mÃ¥lvikt Ã¤r ${goalWeight} kg.`
    : canDiscussMuscleGain
      ? 'Fokus: styrka, protein och Ã¥terhÃ¤mtning.'
      : 'Fokus: stabil energi och jÃ¤mna mÃ¥ltider.'
  const daysMatch = text.match(/(\d+)\s*(dag|dagar)/)
  const planDays = daysMatch
    ? Math.min(Math.max(Number(daysMatch[1]), 2), 7)
    : text.includes('flera dagar') || text.includes('veckoplan') || text.includes('matschema')
      ? 3
      : 0

  if (isMeaninglessMessage(message)) {
    return 'Jag hÃ¤ngde inte riktigt med dÃ¤r. Skriv gÃ¤rna frÃ¥gan en gÃ¥ng till.'
  }

  const multiPartReply = makeMultiPartReply(message, chatHistory)

  if (multiPartReply) {
    return multiPartReply
  }

  if (planDays) {
    const dayTemplates = [
      ['Ã„ggwrap med vitkÃ¥l och keso', 'Kyckling, potatis och frysta grÃ¶nsaker', 1750, 115],
      ['Tonfisk med ris, majs och gurka', 'Linsgryta med potatis och yoghurt', 1800, 105],
      ['Keso, kokt Ã¤gg, knÃ¤ckebrÃ¶d och frukt', 'Tofuwok med nudlar och wokgrÃ¶nsaker', 1700, 100],
      ['BÃ¶nsallad med pasta och Ã¤gg', 'Fiskpinnar, potatis och Ã¤rtor', 1850, 105],
      ['Kycklingwrap med grÃ¶nsaker', 'Chili pÃ¥ bÃ¶nor med ris', 1780, 110],
      ['HavregrynsgrÃ¶t, kvarg och bÃ¤r', 'Omelett med potatis', 1650, 95],
      ['Tonfiskmackor med Ã¤gg', 'Kycklinggryta med ris', 1900, 120],
    ].slice(0, planDays)

    return `En enkel plan:
${dayTemplates
  .map(
    ([lunch, dinner, calories, protein], index) =>
      `Dag ${index + 1}: ${lunch} + ${dinner} (${calories} kcal, ${protein} g protein)`,
  )
  .join('\n')}

Handla: Ã¤gg, kyckling/tonfisk, linser/bÃ¶nor, potatis/ris och frysta grÃ¶nsaker.`
  }

  if (/^(hej|hejsan|hallÃ¥|tjena|god morgon|god kvÃ¤ll)[!.\s]*$/i.test(message.trim())) {
    return 'Hej! Hur kan jag hjÃ¤lpa dig idag?'
  }

  const personalReply = makePersonalCoachReply({
    checkIn,
    currentWeight,
    foods,
    message,
    profile,
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
    return 'Oftast beror det pÃ¥ vad det gÃ¤ller, mÃ¤ngd och hur du mÃ¥r av det. Det Ã¤r sÃ¤llan en enskild vana Ã¤r â€œskadligâ€ i sig, men den kan pÃ¥verka sÃ¶mn, energi, mage eller rutiner. BerÃ¤tta gÃ¤rna vad du syftar pÃ¥, sÃ¥ kan jag svara mer konkret.'
  }

  if (text.includes('hur mycket') && text.includes('vÃ¤ger')) {
    return Number.isFinite(Number(currentWeight))
      ? `Din senaste registrerade vikt Ã¤r ${formatWeight(currentWeight)}.`
      : 'Jag hittar ingen giltig vikt i loggen just nu.'
  }

  if (text.includes('pizza') || text.includes('sugen')) {
    const goalHint =
      goal === 'gÃ¥ ner i vikt'
        ? 'Om mÃ¥let Ã¤r viktnedgÃ¥ng kan du fortfarande Ã¤ta pizza.'
        : 'Det kan absolut fÃ¥ plats i en vanlig rutin.'

    return `${goalHint} Ta en normal portion och komplettera gÃ¤rna med sallad eller nÃ¥got proteinrikt om du vill bli mÃ¤ttare. Ã„r det lunch eller middag du funderar pÃ¥?`
  }

  if (
    (text.includes('Ã¥t') || text.includes('Ã¤tit')) &&
    (text.includes('dÃ¥ligt') || text.includes('onyttigt') || text.includes('helgen'))
  ) {
    return `Det Ã¤r lugnt, en helg fÃ¶rstÃ¶r ingenting. GÃ¶r en enkel reset: drick vatten, Ã¤t en vanlig proteinrik mÃ¥ltid och ta en kort promenad om det kÃ¤nns bra. FÃ¶rsÃ¶k gÃ¥ tillbaka till rutinen utan att kompensera hÃ¥rt. Vad var det som gjorde helgen svÃ¥rast?`
  }

  if (
    text.includes('ikvÃ¤ll') ||
    text.includes('middag') ||
    text.includes('vad ska jag Ã¤ta')
  ) {
    return `Testa nÃ¥got enkelt ikvÃ¤ll:
â€¢ Kyckling + potatis + frysta grÃ¶nsaker
â€¢ Ã„ggwrap med keso och vitkÃ¥l
â€¢ Linsgryta med ris

VÃ¤lj det som gÃ¥r snabbast att laga.`
  }

  if (text.includes('mellanmÃ¥l')) {
    return `Snabba mellanmÃ¥l:
â€¢ Kvarg + bÃ¤r
â€¢ Ã„gg pÃ¥ knÃ¤ckebrÃ¶d
â€¢ Keso + frukt

Ta det som krÃ¤ver minst fix.`
  }

  if (text.includes('motivation') || text.includes('motiver')) {
    return `Det hÃ¤nder alla. FÃ¶rsÃ¶k fokusera pÃ¥ nÃ¤sta lilla steg i stÃ¤llet fÃ¶r hela mÃ¥let. Det kan rÃ¤cka med nÃ¥got vÃ¤ldigt enkelt i dag. Vad kÃ¤nns svÃ¥rast just nu â€“ maten, trÃ¤ningen eller att hÃ¥lla rutinen?`
  }

  if (asksAboutSleep(message)) {
    return makeSleepReply(message)
  }

  if (text.includes('billig') || text.includes('proteinrik lunch') || text.includes('lunch')) {
    return `Billig proteinrik lunch:
â€¢ Tonfisk + ris + majs
â€¢ Ã„ggwrap + keso + grÃ¶nsaker
â€¢ Linsgryta + potatis

VÃ¤lj en och upprepa den i veckan.`
  }

  if (text.includes('vikt') || text.includes('mÃ¥l')) {
    if (canDiscussWeightLoss) {
      return `${weightContext} Titta helst pÃ¥ trenden Ã¶ver flera dagar, inte bara en enskild vÃ¤gning. Vill du att jag jÃ¤mfÃ¶r de senaste registreringarna Ã¥t dig?`
    }

    if (canDiscussMuscleGain) {
      return 'FÃ¶r muskelbygge Ã¤r vikten bara en del av bilden. Det Ã¤r ofta mer anvÃ¤ndbart att fÃ¶lja styrka, energi, protein och Ã¥terhÃ¤mtning.'
    }

    return 'Om mÃ¥let Ã¤r att hÃ¥lla vikten Ã¤r en stabil trend oftast ett bra tecken. Titta pÃ¥ veckosnittet snarare Ã¤n en enskild dag.'
  }

  return makeCommonWellnessReply(message) || 'Jag hÃ¤ngde inte riktigt med dÃ¤r. Kan du skriva lite mer om vad du menar?'
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
  const [demoMode, setDemoMode] = useState(() =>
    readStoredValue(storageKeys.demoMode, false, isStoredBoolean),
  )
  const [profile, setProfile] = useState(() =>
    readStoredValue(storageKeys.profile, null, isStoredProfile),
  )
  const [profileForm, setProfileForm] = useState(() => ({
    ...initialProfile,
    ...(readStoredValue(storageKeys.profile, null, isStoredProfile) ?? {}),
  }))
  const [profileError, setProfileError] = useState('')
  const [proactiveCoachResult, setProactiveCoachResult] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(() => !profile)
  const [checkIn, setCheckIn] = useState(() =>
    readStoredValue(storageKeys.checkIn, initialCheckIn, isStoredCheckIn),
  )
  const [weightInput, setWeightInput] = useState('89,8')
  const [weights, setWeights] = useState(() =>
    readStoredValue(storageKeys.weights, starterWeights, isStoredWeights),
  )
  const [chartRange, setChartRange] = useState('7')
  const [foods, setFoods] = useState(readStoredFoods)
  const [mealType, setMealType] = useState('Lunch')
  const [mealText, setMealText] = useState('')
  const [meals, setMeals] = useState(() =>
    readStoredValue(storageKeys.meals, initialMeals, isStoredMeals),
  )
  const [foodPhotoPreview, setFoodPhotoPreview] = useState('')
  const [mealHistoryImportSummary, setMealHistoryImportSummary] = useState(null)
  const [photoAnalysisStatus, setPhotoAnalysisStatus] = useState('')
  const [photoMeals, setPhotoMeals] = useState(() => {
    const storedMealHistory = getMealHistory()

    if (storedMealHistory.length > 0) {
      return storedMealHistory
    }

    return setMealHistory(
      readStoredValue(
        storageKeys.photoMeals,
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
    readStoredValue(
      storageKeys.scannedProducts,
      initialScannedProducts,
      isStoredScannedProducts,
    ),
  )
  const [progressPhotoNote, setProgressPhotoNote] = useState('')
  const [beforePhotoId, setBeforePhotoId] = useState('')
  const [afterPhotoId, setAfterPhotoId] = useState('')
  const [progressPhotos, setProgressPhotos] = useState(() =>
    readStoredValue(
      storageKeys.progressPhotos,
      initialProgressPhotos,
      isStoredProgressPhotos,
    ),
  )
  const [reminderSettings, setReminderSettings] = useState(() =>
    readStoredValue(
      storageKeys.reminders,
      initialReminderSettings,
      isStoredReminderSettings,
    ),
  )
  const [reminderStatus, setReminderStatus] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [chatMessages, setChatMessages] = useState(() =>
    readStoredValue(storageKeys.chat, initialChatMessages, isStoredChatMessages),
  )
  const [weeklyReport, setWeeklyReport] = useState('')
  const [weeklyReportData, setWeeklyReportData] = useState(null)
  const [weeklyReportStatus, setWeeklyReportStatus] = useState('')

  const latestWeight = weights.at(-1)
  const startWeight = weights[0]
  const weightChange = Number((latestWeight.value - startWeight.value).toFixed(1))
  const foodScore = foods.filter((item) => item.done).length
  const chartWeights = useMemo(
    () => getFilteredWeights(weights, chartRange),
    [chartRange, weights],
  )
  const chartValues = chartWeights.map((entry) => entry.value)
  const chartTrendValues = getLinearTrendValues(chartWeights)
  const chartMin = Math.min(...chartValues, ...chartTrendValues)
  const chartMax = Math.max(...chartValues, ...chartTrendValues)
  const chartRangeSize = Math.max(chartMax - chartMin, 1)
  const chartPadding = 24
  const chartWidth = 360
  const chartHeight = 190
  const chartPoints = getChartPoints(
    chartValues,
    chartMin,
    chartRangeSize,
    chartWidth,
    chartHeight,
    chartPadding,
  )
  const trendPoints = getChartPoints(
    chartTrendValues,
    chartMin,
    chartRangeSize,
    chartWidth,
    chartHeight,
    chartPadding,
  )
  const averageWeeklyChange = getAverageWeeklyChange(chartWeights)
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
            ? 'Tidigare jÃ¤mfÃ¶relsebild'
            : 'Nyaste jÃ¤mfÃ¶relsebild',
        caption: `${index === 0 ? 'Tidigare' : 'Nyaste'} Â· ${formatFullDate(photo.createdAt)}`,
        id: `${photo.id}-${index}`,
        image: photo.image,
      }))
    : []
  const progressPhotoItems = progressPhotos.map((photo) => ({
    alt:
      photo.view === 'front'
        ? 'Framstegsbild framifrÃ¥n'
        : photo.view === 'side'
          ? 'Framstegsbild frÃ¥n sidan'
          : 'Tidigare framstegsbild',
    createdAtLabel: formatFullDate(photo.createdAt),
    id: photo.id,
    image: photo.image,
    note: photo.note || 'Ingen anteckning',
    viewLabel:
      photo.view === 'front'
        ? 'FramifrÃ¥n'
        : photo.view === 'side'
          ? 'FrÃ¥n sidan'
          : 'Tidigare bild',
  }))
  const progressPhotoOptions = progressPhotos.map((photo) => ({
    id: photo.id,
    label: formatFullDate(photo.createdAt),
  }))
  const beforeAfterPhotos = [beforePhoto, afterPhoto]
    .filter(Boolean)
    .map((photo, index) => ({
      alt: index === 0 ? 'FÃ¶rebild' : 'Efterbild',
      caption: `${index === 0 ? 'FÃ¶re' : 'Efter'} Â· ${formatFullDate(photo.createdAt)}`,
      id: `${photo.id}-${index}`,
      image: photo.image,
    }))
  const reminderOptions = [
    {
      enabledKey: 'weight',
      label: 'ViktpÃ¥minnelse',
      timeKey: 'weightTime',
    },
    {
      enabledKey: 'meal',
      label: 'MÃ¥ltidsloggning',
      timeKey: 'mealTime',
    },
    {
      enabledKey: 'water',
      label: 'VattenpÃ¥minnelse',
      timeKey: 'waterTime',
    },
  ]
  const safeProfileGoalWeight =
    profile?.goal === 'gÃ¥ ner i vikt'
      ? formatOptionalWeight(profile?.goalWeight)
      : ''
  const profileSummaryParts = [
    profile?.goal,
    safeProfileGoalWeight ? `mÃ¥l ${safeProfileGoalWeight}` : '',
    profile?.activityLevel ? `aktivitet ${profile.activityLevel}` : '',
  ].filter(Boolean)
  const habitScore = Math.round(
    ((checkIn.energy >= 6 ? 1 : 0) +
      (checkIn.steps >= 7000 ? 1 : 0) +
      (checkIn.workout ? 1 : 0) +
      foodScore / foods.length) *
      25,
  )
  const displayPhotoMeals = photoMeals.map((entry) => ({
    ...entry,
    likelyProtein:
      entry.analysis.likelyProtein ||
      entry.analysis.foods[0] ||
      'ser ut att innehÃ¥lla en proteinkÃ¤lla',
    likelyVegetables:
      entry.analysis.likelyVegetables ||
      entry.analysis.foods[1] ||
      'troligen grÃ¶nsaker eller sallad',
    likelyCarbs:
      entry.analysis.likelyCarbs ||
      entry.analysis.foods[2] ||
      'kan innehÃ¥lla en kolhydratkÃ¤lla',
    summary:
      entry.analysis.summary ||
      `Ser ut att innehÃ¥lla ${entry.analysis.foods.join(', ')}.`,
    positiveFeedback:
      entry.analysis.positiveFeedback ||
      'Bra att du anvÃ¤nder fotoanalysen fÃ¶r att reflektera Ã¶ver mÃ¥ltiden.',
    improvementSuggestion:
      entry.analysis.improvementSuggestion ||
      'Ett enkelt nÃ¤sta steg kan vara att lÃ¤gga till en tydlig grÃ¶nsak eller proteinkÃ¤lla.',
    analysis: {
      ...entry.analysis,
      cheapNextMealSuggestion:
        entry.analysis.cheapNextMealSuggestion ||
        'Billigt nÃ¤sta mÃ¥l: Ã¤gg, potatis och frysta grÃ¶nsaker.',
      fiberCarbBalance:
        entry.analysis.fiberCarbBalance ||
        'VÃ¤lj gÃ¤rna fullkorn, potatis, frukt eller grÃ¶nsaker fÃ¶r bÃ¤ttre fiberbalans.',
      portionEstimate:
        entry.analysis.portionEstimate || 'Portionen ser medelstor ut.',
      proteinStatus:
        entry.analysis.proteinStatus ||
        entry.analysis.likelyProtein ||
        'Proteinstatus Ã¤r osÃ¤ker.',
      vegetableStatus:
        entry.analysis.vegetableStatus ||
        entry.analysis.likelyVegetables ||
        'GrÃ¶nsaksstatus Ã¤r osÃ¤ker.',
    },
  }))
  const mealWeekSummary = getMealWeekSummary(photoMeals)
  const weeklyReportLines = weeklyReport
    ? weeklyReport.split('\n').map((line, index) => ({
      id: `${line}-${index}`,
      isHeading: line.startsWith('###'),
      text: line.replace('### ', ''),
    }))
    : []

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
      : 'Lokal fallback anvÃ¤nds just nu.'
    : demoMode && !showOnboarding
      ? 'Uppdaterar AI-coach...'
      : ''

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
        bodyAnalysisHistory: getAnalysisHistory(),
        checkIn,
        mealHistory: photoMeals,
        meals,
        weights,
      }),
    [checkIn, meals, photoMeals, weights],
  )
  const proactiveCoachInsights =
    proactiveCoachResult?.key === proactiveCoachKey
      ? proactiveCoachResult.insights
      : fallbackProactiveCoachInsights

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
    writeStoredValue(storageKeys.demoMode, demoMode)
  }, [demoMode])

  useEffect(() => {
    writeStoredValue(storageKeys.weights, weights)
  }, [weights])

  useEffect(() => {
    writeStoredValue(storageKeys.foods, foods)
  }, [foods])

  useEffect(() => {
    writeStoredValue(storageKeys.meals, meals)
  }, [meals])

  useEffect(() => {
    setMealHistory(photoMeals)
  }, [photoMeals])

  useEffect(() => {
    writeStoredValue(storageKeys.scannedProducts, scannedProducts)
  }, [scannedProducts])

  useEffect(() => {
    writeStoredValue(storageKeys.progressPhotos, progressPhotos)
  }, [progressPhotos])

  useEffect(() => {
    writeStoredValue(storageKeys.reminders, reminderSettings)
  }, [reminderSettings])

  useEffect(() => {
    writeStoredValue(storageKeys.chat, chatMessages)
  }, [chatMessages])

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
    writeStoredValue(storageKeys.checkIn, checkIn)
  }, [checkIn])

  useEffect(() => {
    if (profile) {
      writeStoredValue(storageKeys.profile, profile)
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
        title: 'ViktpÃ¥minnelse',
      },
      {
        enabled: reminderSettings.meal,
        key: 'meal',
        message: 'LÃ¤gg in en snabb mÃ¥ltidsnotering nÃ¤r du har Ã¤tit.',
        time: reminderSettings.mealTime,
        title: 'MÃ¥ltidspÃ¥minnelse',
      },
      {
        enabled: reminderSettings.water,
        key: 'water',
        message: 'Ta ett glas vatten och kryssa vattenmÃ¥let om det passar.',
        time: reminderSettings.waterTime,
        title: 'VattenpÃ¥minnelse',
      },
    ]

    const intervalId = window.setInterval(() => {
      if (window.Notification.permission !== 'granted') {
        return
      }

      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5)
      const today = now.toLocaleDateString('sv-SE')
      const sentLog = readStoredValue(storageKeys.reminderLog, {}, (value) =>
        Boolean(value && typeof value === 'object'),
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

      writeStoredValue(storageKeys.reminderLog, sentLog)
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [reminderSettings])

  useEffect(() => {
    let cancelled = false

    if (!demoMode || showOnboarding) {
      return () => {
        cancelled = true
      }
    }

    async function loadDailyCoach() {
      try {
        console.info('[Viktkollen daily coach] Calling /api/daily-coach')

        const apiResponse = await fetch('/api/daily-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: makeValidatedProfile(profile),
            checkIn,
            foods,
            meals,
            weights,
            currentWeight: latestWeight.value,
          }),
        })

        if (!apiResponse.ok) {
          throw new Error(`Daily coach API failed with status ${apiResponse.status}`)
        }

        const data = await apiResponse.json()

        console.info('[Viktkollen daily coach] /api/daily-coach response', {
          source: data.source,
          fallbackReason: data.fallbackReason,
          debug: data.debug,
        })

        if (!cancelled && typeof data.summary === 'string' && data.summary.trim()) {
          setDailyCoachResult({
            key: dailyCoachKey,
            source: data.source === 'openai' ? 'openai' : 'mock',
            summary: data.summary.trim(),
          })
        }
      } catch (error) {
        console.warn('[Viktkollen daily coach] API unavailable, using mock', {
          reason: error instanceof Error ? error.message : String(error),
        })

        if (!cancelled) {
          setDailyCoachResult({
            key: dailyCoachKey,
            source: 'mock',
            summary: '',
          })
        }
      }
    }

    void loadDailyCoach()

    return () => {
      cancelled = true
    }
  }, [
    checkIn,
    dailyCoachKey,
    demoMode,
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
      bodyAnalysisHistory: getAnalysisHistory(),
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
  }, [checkIn, meals, photoMeals, proactiveCoachKey, weights])

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
      setProfileError('Startvikt och mÃ¥lvikt mÃ¥ste vara giltiga siffror.')
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

  function startDemo() {
    setDemoMode(true)
  }

  function resetDemoMode() {
    setDemoMode(false)
  }

  function updateCheckIn(key, value) {
    setCheckIn((current) => ({ ...current, [key]: value }))
  }

  function addWeightLog(event) {
    event.preventDefault()
    const nextWeight = parseWeight(weightInput)

    if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
      return
    }

    setWeights((current) => [
      ...current.slice(-6),
      {
        date: getTodayDate(),
        value: nextWeight,
      },
    ])
    setWeightInput('')
  }

  function toggleFood(id) {
    setFoods((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    )
  }

  function addMeal(event) {
    event.preventDefault()
    const text = mealText.trim()

    if (!text) {
      return
    }

    setMeals((current) => [
      { id: Date.now(), type: mealType, text },
      ...current,
    ])
    setMealText('')
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

    setPhotoAnalysisStatus('Analyserar mÃ¥ltid...')
    const analysis = await requestMealAnalysis(foodPhotoPreview)
    const nextEntry = {
      analysis,
      createdAt: new Date().toISOString(),
      id: Date.now(),
      image: foodPhotoPreview,
      source: analysis.source || 'mock',
    }

    setPhotoMeals(addMealAnalysis(nextEntry))
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
          'Importen misslyckades. Kontrollera att filen Ã¤r en exporterad JSON-fil frÃ¥n Viktkollen.',
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
    setPhotoAnalysisStatus('Demo-mÃ¥ltidsdag skapad.')
  }

  function saveScannedProduct(barcode) {
    const normalizedBarcode = barcode.trim()

    if (!normalizedBarcode) {
      setBarcodeStatus('Ange eller skanna en streckkod fÃ¶rst.')
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
        'Kameraskanning stÃ¶ds inte i den hÃ¤r webblÃ¤saren. Skriv koden manuellt.',
      )
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeStatus('Kameran Ã¤r inte tillgÃ¤nglig. Skriv koden manuellt.')
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
          setBarcodeStatus('Kunde inte lÃ¤sa streckkoden Ã¤nnu. FÃ¶rsÃ¶k hÃ¥lla kameran stilla.')
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
      setReminderStatus('WebblÃ¤saren stÃ¶djer inte notiser.')
      return
    }

    const permission = await window.Notification.requestPermission()

    if (permission === 'granted') {
      setReminderStatus('Notiser Ã¤r aktiverade.')
      setReminderSettings((current) => ({ ...current, enabled: true }))
      return
    }

    setReminderStatus('Notiser Ã¤r inte aktiverade. InstÃ¤llningarna sparas Ã¤ndÃ¥.')
  }

  function getValidatedProfile() {
    return makeValidatedProfile(profile)
  }

  async function createWeeklyReport() {
    return createWeeklyReportV2()

  }

  async function createWeeklyReportV2() {
    setWeeklyReportStatus('Skapar AI-veckorapport...')

    const report = await createAiWeeklyReport({
      bodyAnalysisHistory: getAnalysisHistory(),
      checkIn,
      currentWeight: latestWeight.value,
      foods,
      mealHistory: photoMeals,
      meals,
      proactiveCoach: proactiveCoachInsights,
      profile: getValidatedProfile(),
      weights,
    })

    setWeeklyReportData(report)
    setWeeklyReport('')
    setWeeklyReportStatus(
      report.source === 'openai'
        ? 'AI-genererad veckorapport.'
        : 'Smart fallback anvÃ¤nds just nu.',
    )
  }

  async function requestChatReply(message) {
    try {
      console.info('[Viktkollen chat] Calling /api/chat')

      const apiResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          profile: getValidatedProfile(),
          checkIn,
          foods,
          meals,
          weights,
          currentWeight: latestWeight.value,
          chatHistory: chatMessages.slice(-20).map((chatMessage) => ({
            role: chatMessage.role,
            text: chatMessage.text,
          })),
        }),
      })

      if (!apiResponse.ok) {
        throw new Error(`Chat API failed with status ${apiResponse.status}`)
      }

      const data = await apiResponse.json()

      console.info('[Viktkollen chat] /api/chat response', {
        source: data.source,
        fallbackReason: data.fallbackReason,
        debug: data.debug,
      })

      if (typeof data.reply === 'string' && data.reply.trim()) {
        return data.reply.trim()
      }
    } catch (error) {
      console.warn('[Viktkollen chat] /api/chat unavailable, using local mock', {
        reason: error instanceof Error ? error.message : String(error),
      })
      // Vite dev has no serverless route; keep the app useful with mock chat.
    }

    return makeChatResponse(
      message,
      profile,
      checkIn,
      foods,
      latestWeight.value,
      chatMessages.slice(-20),
    )
  }

  function appendChatMessage(role, text) {
    setChatMessages((current) => [
      ...current,
      {
        id: current.length + 1,
        role,
        text,
      },
    ])
  }

  function clearChat() {
    setChatMessages(initialChatMessages)
    setChatInput('')
    setVoiceStatus('')
  }

  async function sendChatText(text) {
    appendChatMessage('user', text)
    const reply = await requestChatReply(text)
    appendChatMessage('assistant', reply)
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
        'RÃ¶stinmatning stÃ¶ds inte i den hÃ¤r webblÃ¤saren. Skriv frÃ¥gan i stÃ¤llet.',
      )
      return
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setVoiceStatus(
        'Mikrofonen krÃ¤ver oftast HTTPS. Testa i en sÃ¤ker webblÃ¤sarsession.',
      )
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatus('Mikrofonen Ã¤r inte tillgÃ¤nglig i den hÃ¤r webblÃ¤saren.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setVoiceStatus(
          'MikrofonbehÃ¶righet nekades. TillÃ¥t mikrofon i webblÃ¤saren och fÃ¶rsÃ¶k igen.',
        )
        return
      }

      if (
        error instanceof DOMException &&
        (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError')
      ) {
        setVoiceStatus('Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frÃ¥gan.')
        return
      }

      setVoiceStatus('Mikrofonen kunde inte starta. FÃ¶rsÃ¶k igen eller skriv frÃ¥gan.')
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
          'MikrofonbehÃ¶righet nekades. TillÃ¥t mikrofon i webblÃ¤saren och fÃ¶rsÃ¶k igen.',
        )
        return
      }

      if (event.error === 'no-speech') {
        setVoiceStatus('Jag hÃ¶rde inget. Tryck pÃ¥ mikrofonen och fÃ¶rsÃ¶k igen.')
        return
      }

      if (event.error === 'audio-capture') {
        setVoiceStatus('Ingen mikrofon hittades. Kontrollera mikrofonen eller skriv frÃ¥gan.')
        return
      }

      setVoiceStatus('Kunde inte lyssna just nu. FÃ¶rsÃ¶k igen eller skriv frÃ¥gan.')
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
          ? 'Texten Ã¤r ifylld. Du kan redigera innan du skickar.'
          : 'Jag hÃ¶rde inget. Tryck pÃ¥ mikrofonen och fÃ¶rsÃ¶k igen.'
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
          : 'Mikrofonen kunde inte starta. FÃ¶rsÃ¶k igen eller skriv frÃ¥gan.',
      )
    }
  }

  function handleStarterPrompt(prompt) {
    void sendChatText(prompt)
  }

  if (!demoMode) {
    return (
      <main className="app-shell welcome-shell">
        <section className="welcome-card">
          <p className="eyebrow">VÃ¤lkommen</p>
          <h1>Viktkollen</h1>
          <p className="welcome-subtitle">
            Din personliga AI-coach fÃ¶r vikt, mat och vanor
          </p>
          <div className="welcome-actions">
            <button type="button" onClick={startDemo}>
              Starta demo
            </button>
            <button className="secondary-button" type="button" disabled>
              Logga in Â· kommer snart
            </button>
          </div>
          <p className="welcome-note">
            Ingen backend och ingen riktig inloggning Ã¤nnu. Demon sparas bara i
            den hÃ¤r webblÃ¤saren.
          </p>
        </section>
      </main>
    )
  }

  if (showOnboarding) {
    return (
      <main className="app-shell onboarding-shell">
        <section className="onboarding-card">
          <p className="eyebrow">VÃ¤lkommen till Viktkollen</p>
          <h1>Skapa din profil</h1>
          <p className="onboarding-copy">
            Svara pÃ¥ nÃ¥gra snabba frÃ¥gor sÃ¥ anpassar vi dashboarden efter ditt
            mÃ¥l. All data sparas bara lokalt i din webblÃ¤sare.
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
              <span>MÃ¥l</span>
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
                <span>MÃ¥lvikt</span>
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
              <span>AktivitetsnivÃ¥</span>
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

            <button type="submit">Spara och fortsÃ¤tt</button>
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
            {profile?.name ? `Hej ${profile.name}` : 'Coach fÃ¶r trÃ¤ning, mat och vanor'}
          </h1>
          <p className="profile-summary">
            {profileSummaryParts.join(' Â· ')}
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowOnboarding(true)}
          >
            Ã„ndra profil
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={resetDemoMode}
          >
            Logga ut demo
          </button>
          <p className="disclaimer">
            Den hÃ¤r appen ger endast allmÃ¤nt stÃ¶d fÃ¶r hÃ¤lsa och vÃ¤lmÃ¥ende. Den Ã¤r
            inte medicinsk rÃ¥dgivning, diagnos eller behandling.
          </p>
        </div>
      </header>

      <section className="dashboard-overview" aria-label="Ã–versikt">
        <article className="dashboard-summary-card">
          <div className="dashboard-summary-heading">
            <div>
              <p className="eyebrow">Din Ã¶versikt</p>
              <h2>Dashboard</h2>
            </div>
            <span>I dag</span>
          </div>

          <div className="dashboard-summary-content">
            <div className="dashboard-weight-summary">
              <span>Nuvarande vikt</span>
              <strong>{formatWeight(latestWeight.value)}</strong>
              <small>
                {formatWeight(weightChange)} sedan start Â· Start{' '}
                {formatWeight(startWeight.value)}
              </small>
            </div>

            <div className="dashboard-stat-grid">
              <div className="dashboard-stat">
                <span>VanepoÃ¤ng</span>
                <strong>{habitScore}%</strong>
                <small>Dagens check-in</small>
              </div>
              <div className="dashboard-stat">
                <span>Matchecklista</span>
                <strong>
                  {foodScore}/{foods.length}
                </strong>
                <small>Grundvanor</small>
              </div>
              <div className="dashboard-stat">
                <span>Steg i dag</span>
                <strong>{checkIn.steps.toLocaleString('sv-SE')}</strong>
                <small>
                  {checkIn.workout ? 'TrÃ¤ning planerad' : 'Ã…terhÃ¤mtningsdag'}
                </small>
              </div>
            </div>
          </div>
        </article>
        <ProactiveCoachCard insights={proactiveCoachInsights} />
      </section>

      <section className="content-grid">
        <article className="panel" id="vikt">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Viktlogg</p>
              <h2>FÃ¶lj utvecklingen</h2>
            </div>
          </div>
          <form className="inline-form" onSubmit={addWeightLog}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Vikt i kg"
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
            />
            <button type="submit">LÃ¤gg till</button>
          </form>
          <WeightChart
            averageWeeklyChangeLabel={`${averageWeeklyChange > 0 ? '+' : ''}${formatWeight(averageWeeklyChange)}`}
            chartHeight={chartHeight}
            chartPadding={chartPadding}
            chartPoints={chartPoints}
            chartRange={chartRange}
            chartRangeOptions={chartRangeOptions}
            chartWeights={chartWeights}
            chartWidth={chartWidth}
            endDateLabel={
              chartWeights.at(-1) ? formatFullDate(chartWeights.at(-1).date) : ''
            }
            onChartRangeChange={setChartRange}
            startDateLabel={
              chartWeights[0] ? formatFullDate(chartWeights[0].date) : ''
            }
            trendPoints={trendPoints}
          />
          <div className="weight-bars" aria-label="Senaste vikttrend">
            {weights.map((weight, index) => {
              const weightValues = weights.map((entry) => entry.value)
              const min = Math.min(...weightValues)
              const max = Math.max(...weightValues)
              const range = Math.max(max - min, 1)
              const height = 36 + ((weight.value - min) / range) * 58

              return (
                <div className="bar-column" key={`${weight.date}-${index}`}>
                  <span style={{ height: `${height}px` }}></span>
                  <small>{formatDecimal(weight.value)}</small>
                  <em>{formatDate(weight.date)}</em>
                </div>
              )
            })}
          </div>
        </article>

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
          starterPrompts={starterPrompts}
          voiceStatus={voiceStatus}
        />

        <AICoach coachMessage={coachMessage} coachStatus={coachStatus} />

        <article className="panel" id="mat">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Matchecklista</p>
              <h2>Grunder fÃ¶r maten</h2>
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
          foodPhotoPreview={foodPhotoPreview}
          handleFoodPhotoChange={handleFoodPhotoChange}
          importSummary={mealHistoryImportSummary}
          mealOptions={mealOptions}
          mealText={mealText}
          mealType={mealType}
          meals={meals}
          onAddMeal={addMeal}
          onAnalyzePhotoMeal={analyzePhotoMeal}
          onCancelClearMealHistory={() => setShowClearMealHistoryConfirm(false)}
          onClearMealHistory={clearLocalMealHistory}
          onCreateDemoMealDay={createDemoMealAnalysisDay}
          onExportMealHistory={exportMealAnalysisHistory}
          onImportMealHistory={importMealAnalysisHistory}
          onMealTextChange={setMealText}
          onMealTypeChange={setMealType}
          onShowClearMealHistory={() => setShowClearMealHistoryConfirm(true)}
          photoAnalysisStatus={photoAnalysisStatus}
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
          onProgressPhotoChange={handleProgressPhotoChange}
          onProgressPhotoNoteChange={setProgressPhotoNote}
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
              <strong>{weightChange <= 0 ? 'NedÃ¥t' : 'UppÃ¥t'}</strong>
            </div>
            <div>
              <span>Matvanor</span>
              <strong>{Math.round((foodScore / foods.length) * 100)}%</strong>
            </div>
            <div>
              <span>Aktivitet</span>
              <strong>{checkIn.steps >= 7000 ? 'PÃ¥ rÃ¤tt vÃ¤g' : 'BehÃ¶ver fler steg'}</strong>
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
        <a href="#hem" aria-label="GÃ¥ till Ã¶versikt">
          <span>âŒ‚</span>
          <strong>Hem</strong>
        </a>
        <a href="#checkin" aria-label="GÃ¥ till dagens check-in">
          <span>âœ“</span>
          <strong>Check</strong>
        </a>
        <a href="#vikt" aria-label="GÃ¥ till viktloggen">
          <span>â†—</span>
          <strong>Vikt</strong>
        </a>
        <a href="#mat" aria-label="GÃ¥ till matchecklistan">
          <span>ï¼‹</span>
          <strong>Mat</strong>
        </a>
        <a href="#framstegsbilder" aria-label="GÃ¥ till framstegsbilder">
          <span>â–£</span>
          <strong>Foto</strong>
        </a>
        <a href="#installningar" aria-label="GÃ¥ till instÃ¤llningar">
          <span>âš™</span>
          <strong>Mer</strong>
        </a>
      </nav>
    </main>
  )
}

export default App
