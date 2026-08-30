import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import HomeSection from './components/sections/HomeSection.jsx'
import MoreSection from './components/sections/MoreSection.jsx'
import NoticesSection from './components/sections/NoticesSection.jsx'
import PlaceSection from './components/sections/PlaceSection.jsx'
import ProgressSection from './components/sections/ProgressSection.jsx'
import ReadySection from './components/sections/ReadySection.jsx'
import WellbeingSection from './components/sections/WellbeingSection.jsx'
import EconomySection from './components/sections/EconomySection.jsx'
import NutritionSection from './components/sections/NutritionSection.jsx'
import CoachSection from './components/sections/CoachSection.jsx'
import AppSection from './components/app/AppSection.jsx'
import SocialRoom from './features/social/components/SocialRoom.jsx'
import './App.css'
import AuthPanel from './components/AuthPanel.jsx'
import AppLoadingScreen from './components/app/AppLoadingScreen.jsx'
import BottomNavigation from './components/app/BottomNavigation.jsx'
import LazySectionFallback from './components/app/LazySectionFallback.jsx'
import OnboardingScreen from './components/app/OnboardingScreen.jsx'
import GlobalSyncStatus from './components/GlobalSyncStatus.jsx'
import PwaExperience from './components/PwaExperience.jsx'
import ReminderBanner from './components/ReminderBanner.jsx'
import {
  bodyAnalysisHistoryChangedEvent,
  getAnalysisHistory,
} from './services/bodyAnalysisHistory.js'
import {
  getAuthErrorMessage,
  getAuthStatus,
  getCurrentAuthSession,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeToAuthChanges,
} from './services/authService.js'
import { createDashboardData } from './services/dashboardService.js'
import { clearSharedAnalyticsCache } from './services/sharedAnalyticsCache.js'
import {
  formatKg as formatHealthKg,
  getProteinNeedForContext,
  getWeightStats,
} from './services/healthCalculations.js'
import { buildHealthSnapshot } from './services/healthSnapshot.js'
import { getSafeErrorMessage } from './services/appErrorService.js'
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
import {
  analyzeBodyMeasurements,
  analyzeWeights,
  createProgressInsights,
  createWeightProjection,
  migrateDuplicateWeightEntries,
  normalizeBodyMeasurements,
  normalizeGoalSettings,
  normalizeWeights,
} from './services/progressService.js'
import {
  createProfileForm,
  getProfileCompleteness,
  hasUsableProfile,
  normalizeProfile,
  profileDraftToProfile,
} from './services/profileService.js'
import * as userDataRepository from './services/userDataRepository.js'
import { loadAiApiService, loadAiCoachV2Service, loadAiSuggestions, loadAiUserContext, loadProactiveCoachService, loadWeeklyReportService } from './services/ai/aiRuntimeLoader.js'
import { prepareCoachChatSubmission, requestCoachChatReply, requestCoachRealtimeSession } from './services/ai/aiChatController.js'
import AiCoachOverlay from './components/AiCoachOverlay.jsx'
import { createVoiceConversationController } from './services/voiceConversationController.js'
import {
  connectOpenAiRealtimeWebRtc,
  createRealtimeVoiceController,
} from './services/ai/realtimeVoiceController.js'
import {
  incrementPremiumAnalyticsCounter,
  premiumAnalyticsCounters,
} from './services/premiumAnalytics.js'
import { useGlobalSyncScheduler } from './services/sync/useGlobalSyncScheduler.js'
import { getSyncStatusSnapshot } from './services/sync/syncStatusStore.js'
import {
  readReminderState,
  saveReminderState,
  claimReminderSchedulerLeadership,
  releaseReminderSchedulerLeadership,
} from './services/reminders/reminderRepository.js'
import { completeReminder, skipReminder, snoozeReminder } from './services/reminders/reminderActions.js'
import { buildReminderStatus, createReminderScheduler, getDueReminders } from './services/reminders/reminderScheduler.js'
import { syncLegacyReminderSettingsToV2 } from './services/reminders/reminderLegacyAdapter.js'
import { applyDueNotificationPlan } from './services/notifications/notificationSchedulerBridge.js'
import { logNavigationOrigin } from './services/navigation/navigationOriginDiagnostics.js'
import { resolveMoreFolderFromTarget } from './services/more/moreFolders.js'
import i18n, { changeAppLanguage, getActiveLanguageCode } from './i18n/index.js'
import { getFeatureFlags, isFeatureEnabled } from './features/featureRegistry.js'

const LaunchReadinessPanel = lazy(() => import('./components/LaunchReadinessPanel.jsx'))
const DataImportCenter = lazy(() => import('./components/DataImportCenter.jsx'))
const DataExportCenter = lazy(() => import('./components/DataExportCenter.jsx'))
const ManualAcceptanceRunner = import.meta.env.DEV
  ? lazy(() => import('./components/ManualAcceptanceRunner.jsx'))
  : null
const PremiumAnalyticsPanel = import.meta.env.DEV
  ? lazy(() => import('./components/PremiumAnalyticsPanel.jsx'))
  : null
const SyncHealthDashboard = lazy(() => import('./components/SyncHealthDashboard.jsx'))

function isInternalToolsEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false

  const params = new URLSearchParams(window.location.search)
  const explicitFlag = params.get('internalTools') === '1' || params.get('devtools') === '1'

  return explicitFlag || window.localStorage?.getItem('viktkollen.internalTools') === '1'
}


const starterWeights = []

const defaultAiStarterPrompts = [
  'Hur mycket väger jag nu?',
  'Hur mycket har jag gått ner?',
  'Vad ska jag äta ikväll?',
  'Hur kan jag hålla motivationen?',
]

function readInitialWeights() {
  const storedWeights = userDataRepository.getWeights(starterWeights, Array.isArray)
  const migration = migrateDuplicateWeightEntries(storedWeights)

  if (migration.changed) {
    userDataRepository.saveWeights(migration.weights)
  }

  return migration.weights
}

function getAuthSessionUserId(session) {
  return session?.user?.id ? String(session.user.id) : ''
}

const initialFoods = [
  { id: 'protein', label: 'Protein till varje måltid (20-30 g)', done: false },
  { id: 'veg', label: 'Frukt eller grönsaker', done: false },
  { id: 'water', label: 'Vattenmål', done: false },
  { id: 'snack', label: 'Planerat mellanmål', done: false },
]

const initialMeals = []

const initialPhotoMeals = []

const initialScannedProducts = []

const initialProgressPhotos = []

const initialReminderSettings = {
  enabled: false,
  weight: false,
  weightTime: '08:00',
  meal: false,
  mealTime: '12:00',
  water: false,
  waterTime: '15:00',
}

const initialChatMessages = []

const initialCheckIn = {
  energy: null,
  steps: null,
  mood: '',
  workout: false,
}

const goalOptions = [
  { label: 'Gå ner i vikt', value: 'loss' },
  { label: 'Hålla vikten', value: 'maintain' },
  { label: 'Gå upp i vikt', value: 'gain' },
]

const activityOptions = [
  { label: 'Låg', value: 'low' },
  { label: 'Lätt', value: 'light' },
  { label: 'Medel', value: 'moderate' },
  { label: 'Hög', value: 'high' },
]

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
    (value.energy === null || Number.isFinite(value.energy)) &&
    (value.steps === null || Number.isFinite(value.steps)) &&
    typeof value.mood === 'string' &&
    typeof value.workout === 'boolean'
  )
}

function isStoredProfile(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeStoredProfile(value) {
  return value ? normalizeProfile(value) : null
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

function formatWeight(value) {
  return formatHealthKg(value, {
    fallback: '',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })
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
      summary: `Lägg till en till bild ${viewLabel} för att skapa en försiktig jämförelse.`,
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

function makeCoachMessage(profile, checkIn, foods, meals) {
  const completedFoods = foods.filter((item) => item.done).length
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hålla en stabil rutin'
  const steps = Number(checkIn?.steps)
  const mealCount = meals.length
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
    mealCount > 0
      ? `${mealCount} måltider loggade i dag.`
      : 'Logga en snabb måltid när du kan.'
  const stepsHint = Number.isFinite(steps)
    ? steps >= 9000
      ? `Stegen är starka: ${steps.toLocaleString('sv-SE')} idag.`
      : steps >= 5000
        ? `Stegen är på väg: ${steps.toLocaleString('sv-SE')} idag.`
        : `Stegen är låga än så länge: ${steps.toLocaleString('sv-SE')} idag.`
    : 'Steg saknas i dagens check-in.'
  const nextStep =
    completedFoods < 2
      ? 'Konkreta nästa steg: välj en proteinrik måltid och lägg till grönsaker.'
      : mealCount === 0
        ? 'Konkreta nästa steg: logga första måltiden så blir coachingen skarpare.'
        : Number.isFinite(steps) && steps < 5000
          ? 'Konkreta nästa steg: ta 10 minuter lugn promenad om kroppen känns okej.'
          : 'Konkreta nästa steg: behåll tempot och gör kvällens val enkelt.'

  return `${name}, dagens riktning:
• ${focusHint}
• ${energyHint}
• ${nutritionHint}
• ${mealHint}
• ${stepsHint}
• ${nextStep}`
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

async function makeChatResponse(
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
    const greetingCount = chatHistory.filter((entry) =>
      entry?.role === 'user' &&
      /^(hej|hejsan|hallå|tjena|god morgon|god kväll)[!.\s]*$/i.test(String(entry.text || '').trim()),
    ).length
    const assistantHasGreeted = chatHistory.some((entry) =>
      entry?.role === 'assistant' &&
      String(entry.text || '').toLocaleLowerCase('sv-SE').includes('hur kan jag hjälpa'),
    )
    const hasGreeted = greetingCount > 1 || assistantHasGreeted

    return hasGreeted ? 'Jag är kvar. Vad vill du ta nästa?' : 'Hej! Hur kan jag hjälpa dig idag?'
  }

  const { makePersonalCoachReply } = await import('./lib/coachReply.js')
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
  const { t } = useTranslation('navigation')
  const barcodeVideoRef = useRef(null)
  const barcodeStreamRef = useRef(null)
  const barcodeTimerRef = useRef(null)
  const chatThreadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const chatRequestInFlightRef = useRef(false)
  const chatMessagesRef = useRef(initialChatMessages)
  const isAiVoiceEnabledRef = useRef(true)
  const voiceConversationRef = useRef(null)
  const realtimeVoiceRef = useRef(null)
  const avatarLiveContextRef = useRef({ clothingAdvice: null, liveWeather: null, surface: 'coach' })
  const [aiCoachOverlayOpen, setAiCoachOverlayOpen] = useState(false)
  const [isVoiceMuted, setIsVoiceMuted] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const [authSession, setAuthSession] = useState(null)
  const authStatus = useMemo(() => getAuthStatus(), [])
  const authUserId = getAuthSessionUserId(authSession)
  const userDataScope = useMemo(() => userDataRepository.createUserDataScopeFromAuth({
    authLoading,
    userId: authUserId,
  }), [authLoading, authUserId])
  const [profile, setProfile] = useState(null)
  const [profileForm, setProfileForm] = useState(() => createProfileForm({}))
  const [profileError, setProfileError] = useState('')
  const [proactiveCoachResult, setProactiveCoachResult] = useState(null)
  const [hydratedScopeId, setHydratedScopeId] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [currentLanguage, setCurrentLanguage] = useState(() => getActiveLanguageCode())
  const [activeAppSection, setActiveAppSection] = useState('home')
  const featureFlags = getFeatureFlags()
  const reminderHubUiEnabled = isFeatureEnabled('reminderHubUi', featureFlags)
  const socialUiEnabled = isFeatureEnabled('socialUi', featureFlags)
  const [nutritionIntent, setNutritionIntent] = useState(null)
  const [progressIntent, setProgressIntent] = useState(null)
  const [moreIntent, setMoreIntent] = useState(null)
  const [showInternalTools] = useState(isInternalToolsEnabled)
  const [checkIn, setCheckIn] = useState(() =>
    userDataRepository.getCheckIn(initialCheckIn, isStoredCheckIn),
  )
  const [weights, setWeights] = useState(starterWeights)
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
  const [goalsHabits, setGoalsHabits] = useState(() =>
    userDataRepository.getGoalsHabits({}, (value) => value && typeof value === 'object' && !Array.isArray(value)),
  )
  const [adaptiveCoachFeedback, setAdaptiveCoachFeedback] = useState(() =>
    userDataRepository.getAdaptiveCoachFeedback({}, (value) => value && typeof value === 'object' && !Array.isArray(value)),
  )
  const adaptiveCoachFeedbackRef = useRef(adaptiveCoachFeedback)
  const [healthDashboardPeriod, setHealthDashboardPeriod] = useState(() =>
    userDataRepository.getHealthDashboardPeriod('30d', (value) =>
      ['7d', '30d', '90d', '180d', '365d', 'all'].includes(value)),
  )
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
  const [reminderState, setReminderState] = useState(() => readReminderState())
  const reminderStateRef = useRef(reminderState)
  const reminderTabId = useId()
  const [reminderStatus, setReminderStatus] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatEngineStatus, setChatEngineStatus] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isVoiceConversationActive, setIsVoiceConversationActive] = useState(false)
  const [isAiVoiceEnabled, setIsAiVoiceEnabled] = useState(() =>
    userDataRepository.getVoiceConversationSettings({ aiVoiceEnabled: true })?.aiVoiceEnabled !== false,
  )
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

  useEffect(() => {
    function routeHash() {
      const targetId = String(window.location.hash || '').replace(/^#/, '')
      if (!targetId) return
      const sectionId = targetId.replace(/^app-section-/, '')

      if (sectionId === 'progress' || sectionId === 'nutrition' || sectionId === 'coach' || sectionId === 'wellbeing' || sectionId === 'economy' || resolveMoreFolderFromTarget(targetId)) {
        const folder = resolveMoreFolderFromTarget(targetId)
          || (sectionId === 'nutrition' ? 'mat' : sectionId === 'coach' ? 'ai-coach' : sectionId === 'progress' ? 'mal-framsteg' : sectionId === 'wellbeing' ? 'ma-bra' : sectionId === 'economy' ? 'ekonomi' : null)
        setMoreIntent({ id: Date.now(), targetId: folder || targetId })
        setActiveAppSection('more')
        return
      }

      if (sectionId === 'notices' && reminderHubUiEnabled) {
        setActiveAppSection('notices')
      }
    }

    routeHash()
    window.addEventListener('hashchange', routeHash)
    return () => window.removeEventListener('hashchange', routeHash)
  }, [reminderHubUiEnabled])

  useEffect(() => {
    const handleLanguageChange = (languageCode) => {
      setCurrentLanguage(languageCode)
    }

    i18n.on('languageChanged', handleLanguageChange)
    return () => i18n.off('languageChanged', handleLanguageChange)
  }, [])

  const profileWeightsHydrated = userDataRepository.isUserDataScopeHydrated(userDataScope, hydratedScopeId)
  const scopedProfile = profileWeightsHydrated ? profile : null
  const scopedWeights = profileWeightsHydrated ? weights : starterWeights

  useEffect(() => {
    userDataRepository.saveLocalePreference(currentLanguage, scopedProfile)
  }, [currentLanguage, scopedProfile])

  const validatedProfile = useMemo(() => normalizeProfile(scopedProfile || {}), [scopedProfile])
  const profileCompleteness = useMemo(() => getProfileCompleteness(validatedProfile), [validatedProfile])
  const profileFormCompleteness = useMemo(() => getProfileCompleteness(profileForm), [profileForm])
  const healthSnapshot = useMemo(
    () =>
      buildHealthSnapshot({
        checkIn,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        profile: validatedProfile,
        today: selectedMealDate,
        weights: scopedWeights,
      }),
    [checkIn, meals, nutritionGoals, photoMeals, scopedWeights, selectedMealDate, validatedProfile],
  )
  const centralWeightStats = useMemo(
    () => getWeightStats(healthSnapshot.weight.dailyWeights, { startWeight: validatedProfile.startWeight }),
    [healthSnapshot.weight.dailyWeights, validatedProfile.startWeight],
  )
  const reminderSchedulerStatus = useMemo(() => buildReminderStatus(reminderState), [reminderState])
  const dueReminders = useMemo(() => getDueReminders(reminderState), [reminderState])
  const latestWeight = healthSnapshot.weight.dailyWeights.at(-1) || { value: healthSnapshot.weight.current }
  const centralCurrentWeight = healthSnapshot.weight.current
  const [aiStarterPrompts, setAiStarterPrompts] = useState(defaultAiStarterPrompts)
  const foodScore = foods.filter((item) => item.done).length
  const progressAnalysis = useMemo(
    () => analyzeWeights(healthSnapshot.weight.dailyWeights, validatedProfile),
    [healthSnapshot.weight.dailyWeights, validatedProfile],
  )
  const progressProjection = useMemo(
    () => createWeightProjection(healthSnapshot.weight.dailyWeights, validatedProfile),
    [healthSnapshot.weight.dailyWeights, validatedProfile],
  )
  const bodyMeasurementAnalysis = useMemo(
    () => analyzeBodyMeasurements(bodyMeasurements),
    [bodyMeasurements],
  )
  const progressInsights = useMemo(
    () =>
      createProgressInsights({
        bodyMeasurements,
        profile: validatedProfile,
        weights: healthSnapshot.weight.dailyWeights,
      }),
    [bodyMeasurements, healthSnapshot.weight.dailyWeights, validatedProfile],
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
    createdAt: photo.createdAt,
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
    weight: photo.weight,
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
  const [monthlyReport, setMonthlyReport] = useState(null)
  useEffect(() => {
    let cancelled = false

    import('./services/monthlyReportService.js')
      .then(({ createMonthlyHealthReport }) => {
        if (cancelled) return
        setMonthlyReport(createMonthlyHealthReport({
          adaptiveCoachFeedback,
          goalsHabits,
          healthSnapshot,
          mealHistory: photoMeals,
          meals,
          weights: scopedWeights,
        }))
      })
      .catch(() => {
        if (!cancelled) setMonthlyReport(null)
      })

    return () => {
      cancelled = true
    }
  }, [adaptiveCoachFeedback, goalsHabits, healthSnapshot, meals, photoMeals, scopedWeights])

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
        scopedProfile,
        healthSnapshot.checkIn.latestToday || checkIn,
        foods,
        healthSnapshot.nutrition.mealsToday,
      ),
    [checkIn, foods, healthSnapshot.checkIn.latestToday, healthSnapshot.nutrition.mealsToday, scopedProfile],
  )
  const dailyCoachKey = useMemo(
    () =>
      JSON.stringify({
        checkIn,
        currentWeight: centralCurrentWeight,
        foods,
        goalsHabits,
        healthSnapshot,
        meals,
        nutritionGoals,
        profile: scopedProfile,
        selectedMealDate,
        weights: scopedWeights,
      }),
    [centralCurrentWeight, checkIn, foods, goalsHabits, healthSnapshot, meals, nutritionGoals, scopedProfile, scopedWeights, selectedMealDate],
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
  const [currentCoachPreview, setCurrentCoachPreview] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadCoachPreview() {
      const { createAiCoachV2Report } = await loadAiCoachV2Service()
      const report = createAiCoachV2Report({
        checkIn,
        bodyAnalysisHistory,
        goalsHabits,
        healthSnapshot,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        nutritionInsights,
        nutritionSummary: dailyNutritionSummary,
        previousReports: coachReports,
        progressAnalysis,
        progressInsights,
        progressProjection,
        profile: validatedProfile,
        reminderState,
        today: selectedMealDate,
        bodyMeasurementAnalysis,
        bodyMeasurements,
        weeklyNutrition: weeklyNutritionSummary,
        weights: scopedWeights,
      })

      if (!cancelled) {
        setCurrentCoachPreview(report)
      }
    }

    void loadCoachPreview().catch(() => {
      if (!cancelled) {
        setCurrentCoachPreview(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    bodyMeasurementAnalysis,
    bodyMeasurements,
    bodyAnalysisHistory,
    checkIn,
    coachReports,
    dailyNutritionSummary,
    healthSnapshot,
    meals,
    goalsHabits,
    nutritionGoals,
    nutritionInsights,
    photoMeals,
    progressAnalysis,
    progressInsights,
    progressProjection,
    selectedMealDate,
    reminderState,
    validatedProfile,
    weeklyNutritionSummary,
    scopedWeights,
  ])

  const proactiveCoachKey = useMemo(
    () =>
      JSON.stringify({
        checkIn,
        meals,
        photoMeals,
        selectedMealDate,
        weights: scopedWeights,
      }),
    [checkIn, meals, photoMeals, scopedWeights, selectedMealDate],
  )
  const [fallbackProactiveCoachInsights, setFallbackProactiveCoachInsights] = useState([])
  const proactiveCoachInsights =
    proactiveCoachResult?.key === proactiveCoachKey
      ? proactiveCoachResult.insights
      : fallbackProactiveCoachInsights
  const createWeeklyReport = useCallback(async () => {
    setWeeklyReportStatus('Skapar AI-veckorapport...')

    try {
      const { createWeeklyReport: createAiWeeklyReport } = await loadWeeklyReportService()
      const report = await createAiWeeklyReport({
        bodyAnalysisHistory,
        adaptiveCoachFeedback,
        checkIn,
        currentWeight: centralCurrentWeight,
        foods,
        goalsHabits,
        healthSnapshot,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        proactiveCoach: proactiveCoachInsights,
        profile: validatedProfile,
        today: selectedMealDate,
        weights: scopedWeights,
      })

      setWeeklyReportData(report)
      setWeeklyReport('')
      setWeeklyReportStatus(
        report.source === 'openai'
          ? 'AI-genererad veckorapport.'
          : 'Smart fallback används just nu.',
      )
    } catch (error) {
      setWeeklyReportStatus(getSafeErrorMessage(error, { area: 'network' }))
    }
  }, [
    checkIn,
    adaptiveCoachFeedback,
    bodyAnalysisHistory,
    centralCurrentWeight,
    foods,
    goalsHabits,
    healthSnapshot,
    meals,
    nutritionGoals,
    photoMeals,
    proactiveCoachInsights,
    scopedWeights,
    selectedMealDate,
    validatedProfile,
  ])
  const createCoachReport = useCallback(() => {
    setIsGeneratingCoachReport(true)

    window.setTimeout(() => {
      void loadAiCoachV2Service()
        .then(({ createAiCoachV2Report }) => {
          const report = createAiCoachV2Report({
            checkIn,
            bodyAnalysisHistory,
            goalsHabits,
            healthSnapshot,
            mealHistory: photoMeals,
            meals,
            nutritionGoals,
            nutritionInsights,
            nutritionSummary: dailyNutritionSummary,
            previousReports: coachReports,
            progressAnalysis,
            progressInsights,
            progressProjection,
            profile: validatedProfile,
            reminderState,
            today: selectedMealDate,
            bodyMeasurementAnalysis,
            bodyMeasurements,
            weeklyNutrition: weeklyNutritionSummary,
            weights: scopedWeights,
          })

          setCoachReports((current) => [report, ...current].slice(0, 20))
        })
        .finally(() => setIsGeneratingCoachReport(false))
    }, 350)
  }, [
    checkIn,
    bodyAnalysisHistory,
    coachReports,
    dailyNutritionSummary,
    healthSnapshot,
    goalsHabits,
    meals,
    nutritionGoals,
    nutritionInsights,
    photoMeals,
    reminderState,
    validatedProfile,
    progressAnalysis,
    progressInsights,
    progressProjection,
    selectedMealDate,
    bodyMeasurementAnalysis,
    bodyMeasurements,
    scopedWeights,
    weeklyNutritionSummary,
  ])
  const deleteCoachReport = useCallback((reportId) => {
    setCoachReports((current) => current.filter((report) => report.id !== reportId))
  }, [])
  const handleCoachRecommendationFeedback = useCallback((reportId, recommendationId, feedback) => {
    if (!['helpful', 'not_relevant'].includes(feedback)) return

    setCoachReports((current) =>
      current.map((report) =>
        report.id === reportId
          ? {
            ...report,
            recommendations: (report.recommendations || []).map((recommendation) =>
              recommendation.id === recommendationId
                ? {
                  ...recommendation,
                  feedback: {
                    at: new Date().toISOString(),
                    value: feedback,
                  },
                  status: feedback === 'helpful' ? 'helpful' : 'dismissed',
                }
                : recommendation,
            ),
          }
          : report,
      ),
    )
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
        goalsHabits,
        healthSnapshot,
        mealHistory: photoMeals,
        meals,
        nutritionGoals,
        profile: validatedProfile,
        proactiveCoach: proactiveCoachInsights,
        today: selectedMealDate,
        weights: scopedWeights,
        weeklyReportData,
        weeklyReportLines,
      }),
    [
      bodyAnalysisHistory,
      chatMessages,
      checkIn,
      foods,
      goalsHabits,
      healthSnapshot,
      meals,
      nutritionGoals,
      photoMeals,
      proactiveCoachInsights,
      selectedMealDate,
      validatedProfile,
      weeklyReportData,
      weeklyReportLines,
      scopedWeights,
    ],
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
    let cancelled = false

    userDataRepository.setActiveUserDataScope(userDataScope)

    queueMicrotask(() => {
      if (cancelled) return

      if (userDataScope.kind === 'loading') {
        setProfile(null)
        setProfileForm(createProfileForm({}))
        setShowOnboarding(false)
        setWeights(starterWeights)
        setHydratedScopeId('')
        return
      }

      userDataRepository.migrateLegacyProfileAndWeights(userDataScope, {
        isProfile: isStoredProfile,
        isWeights: Array.isArray,
      })

      const nextProfile = normalizeStoredProfile(userDataRepository.getProfile(null, isStoredProfile))
      setProfile(nextProfile)
      setProfileForm(createProfileForm(nextProfile ?? {}))
      setShowOnboarding(!hasUsableProfile(nextProfile))
      setWeights(readInitialWeights())
      setHydratedScopeId(userDataScope.storageId)
    })

    return () => {
      cancelled = true
    }
  }, [userDataScope])

  useEffect(() => {
    if (!profileWeightsHydrated) return

    userDataRepository.saveWeights(scopedWeights)
  }, [profileWeightsHydrated, scopedWeights])

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
    userDataRepository.saveGoalsHabits(goalsHabits)
  }, [goalsHabits])

  useEffect(() => {
    userDataRepository.saveAdaptiveCoachFeedback(adaptiveCoachFeedback)
  }, [adaptiveCoachFeedback])

  useEffect(() => {
    userDataRepository.saveHealthDashboardPeriod(healthDashboardPeriod)
  }, [healthDashboardPeriod])

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
    const tabId = `reminder-${reminderTabId}`
    const hasLeadership = claimReminderSchedulerLeadership(tabId)
    if (!hasLeadership) return undefined

    const scheduler = createReminderScheduler({
      getState: () => reminderStateRef.current,
      onDue: (due, now) => {
        setReminderState((current) => applyDueNotificationPlan(current, {
          adaptiveCoachFeedback: adaptiveCoachFeedbackRef.current,
          due,
          now,
          syncStatus: getSyncStatusSnapshot(),
        }))
      },
    })

    function refreshLeadership() {
      if (claimReminderSchedulerLeadership(tabId)) scheduler.recalculate()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshLeadership()
    }

    scheduler.start()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', refreshLeadership)
    window.addEventListener('focus', refreshLeadership)

    return () => {
      scheduler.stop()
      releaseReminderSchedulerLeadership(tabId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', refreshLeadership)
      window.removeEventListener('focus', refreshLeadership)
    }
  }, [reminderTabId])

  useEffect(() => {
    reminderStateRef.current = reminderState
    saveReminderState(reminderState)
  }, [reminderState])

  useEffect(() => {
    adaptiveCoachFeedbackRef.current = adaptiveCoachFeedback
  }, [adaptiveCoachFeedback])

  useEffect(() => {
    chatMessagesRef.current = chatMessages
    userDataRepository.saveCoachChat(chatMessages)
  }, [chatMessages])

  useEffect(() => {
    isAiVoiceEnabledRef.current = isAiVoiceEnabled
    userDataRepository.saveVoiceConversationSettings({ aiVoiceEnabled: isAiVoiceEnabled })
  }, [isAiVoiceEnabled])

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
    if (profileWeightsHydrated && scopedProfile) {
      userDataRepository.saveProfile(scopedProfile)
    }
  }, [profileWeightsHydrated, scopedProfile])

  useEffect(
    () => () => {
      voiceConversationRef.current?.dispose()
      realtimeVoiceRef.current?.stop()

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

    async function loadStarterPrompts() {
      try {
        const [{ buildAiUserContext }, { createAiSuggestions }] = await Promise.all([
          loadAiUserContext(),
          loadAiSuggestions(),
        ])
        const context = buildAiUserContext({
          bodyAnalysisHistory,
          chatHistory: chatMessages,
          checkIn,
          currentWeight: centralCurrentWeight,
          foods,
          healthSnapshot,
          latestWeeklyReport: weeklyReportData,
          mealHistory: photoMeals,
          meals,
          nutritionGoals,
          profile: validatedProfile,
          today: selectedMealDate,
          weights: scopedWeights,
        })
        const prompts = createAiSuggestions(context).slice(0, 4)

        if (!cancelled && prompts.length > 0) {
          setAiStarterPrompts(prompts)
        }
      } catch {
        // Keep the static starter prompts when the optional AI suggestion chunk fails.
      }
    }

    void loadStarterPrompts()

    return () => {
      cancelled = true
    }
  }, [
    bodyAnalysisHistory,
    centralCurrentWeight,
    chatMessages,
    checkIn,
    foods,
    healthSnapshot,
    meals,
    nutritionGoals,
    photoMeals,
    selectedMealDate,
    validatedProfile,
    weeklyReportData,
    scopedWeights,
  ])

  useEffect(() => {
    let cancelled = false

    if (!authSession || showOnboarding) {
      return () => {
        cancelled = true
      }
    }

    async function loadDailyCoach() {
      try {
        const { requestAiEndpoint } = await loadAiApiService()
        const result = await requestAiEndpoint({
          action: 'daily-coach',
          checkIn,
          foods,
          healthSnapshot,
          mealHistory: photoMeals,
          meals,
          nutritionGoals,
          profile: validatedProfile,
          today: selectedMealDate,
          weights: healthSnapshot.weight.dailyWeights,
          currentWeight: centralCurrentWeight,
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
      } catch {
        // Daily coach falls back to the deterministic local summary below.
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
    centralCurrentWeight,
    dailyCoachKey,
    authSession,
    foods,
    healthSnapshot,
    meals,
    nutritionGoals,
    photoMeals,
    selectedMealDate,
    showOnboarding,
    validatedProfile,
  ])

  useEffect(() => {
    let cancelled = false
    const coachData = {
      bodyAnalysisHistory,
      checkIn,
      healthSnapshot,
      mealHistory: photoMeals,
      meals,
      today: selectedMealDate,
      weights: scopedWeights,
    }

    async function loadProactiveCoach() {
      let fallbackInsights = []

      try {
        const { getProactiveCoachInsights, makeProactiveCoachInsights } = await loadProactiveCoachService()
        fallbackInsights = makeProactiveCoachInsights(coachData)

        if (!cancelled) {
          setFallbackProactiveCoachInsights(fallbackInsights)
        }

        const insights = await getProactiveCoachInsights(coachData)

        if (!cancelled) {
          setProactiveCoachResult({
            insights,
            key: proactiveCoachKey,
          })
        }
      } catch {
        if (!cancelled) {
          setProactiveCoachResult({
            insights: fallbackInsights,
            key: proactiveCoachKey,
          })
        }
      }
    }

    void loadProactiveCoach()

    return () => {
      cancelled = true
    }
  }, [bodyAnalysisHistory, checkIn, healthSnapshot, meals, photoMeals, proactiveCoachKey, scopedWeights, selectedMealDate])

  const refreshAppStateFromStorage = useCallback(() => {
    if (!profileWeightsHydrated) return

    userDataRepository.setActiveUserDataScope(userDataScope)
    clearSharedAnalyticsCache()
    const nextProfile = normalizeStoredProfile(userDataRepository.getProfile(null, isStoredProfile))
    const storedMealHistory = getMealHistory()
    const nextPhotoMeals = storedMealHistory.length > 0
      ? storedMealHistory
      : setMealHistory(
        userDataRepository.getLegacyPhotoMeals(
          initialPhotoMeals,
          isStoredPhotoMeals,
        ),
    )

    setProfile(nextProfile)
    setProfileForm(createProfileForm(nextProfile ?? {}))
    setShowOnboarding(!hasUsableProfile(nextProfile))
    setCheckIn(userDataRepository.getCheckIn(initialCheckIn, isStoredCheckIn))
    setWeights(readInitialWeights())
    setBodyMeasurements(normalizeBodyMeasurements(userDataRepository.getBodyMeasurements([], Array.isArray)))
    setProgressGoalSettings(
      normalizeGoalSettings(
        userDataRepository.getProgressGoalSettings({}, (value) =>
          value && typeof value === 'object' && !Array.isArray(value),
        ),
      ),
    )
    setProgressReports(userDataRepository.getProgressReports([], Array.isArray))
    setFoods(readStoredFoods())
    setGoalsHabits(userDataRepository.getGoalsHabits({}, (value) => value && typeof value === 'object' && !Array.isArray(value)))
    setAdaptiveCoachFeedback(userDataRepository.getAdaptiveCoachFeedback({}, (value) => value && typeof value === 'object' && !Array.isArray(value)))
    setHealthDashboardPeriod(userDataRepository.getHealthDashboardPeriod('30d', (value) =>
      ['7d', '30d', '90d', '180d', '365d', 'all'].includes(value)))
    setMeals(normalizeMeals(userDataRepository.getMeals(initialMeals, isStoredMeals)))
    setNutritionGoals(
      normalizeNutritionGoals(
        userDataRepository.getNutritionGoals({}, (value) =>
          value && typeof value === 'object' && !Array.isArray(value),
        ),
      ),
    )
    setFavoriteMeals(normalizeFavoriteMeals(userDataRepository.getFavoriteMeals([], Array.isArray)))
    setPhotoMeals(nextPhotoMeals)
    setScannedProducts(userDataRepository.getScannedProducts(initialScannedProducts, isStoredScannedProducts))
    setProgressPhotos(userDataRepository.getProgressPhotos(initialProgressPhotos, isStoredProgressPhotos))
    setReminderSettings(userDataRepository.getReminderSettings(initialReminderSettings, isStoredReminderSettings))
    setReminderState(readReminderState())
    setChatMessages(userDataRepository.getCoachChat(initialChatMessages, isStoredChatMessages))
    setCoachReports(userDataRepository.getAiCoachReports([], Array.isArray))
    setBodyAnalysisHistory(getAnalysisHistory())
  }, [profileWeightsHydrated, userDataScope])

  useGlobalSyncScheduler(authUserId, {
    onDataChanged: refreshAppStateFromStorage,
  })

  function updateProfileForm(key, value) {
    setProfileForm((current) => ({ ...current, [key]: value }))
  }

  function handleLanguageChange(nextLanguage) {
    changeAppLanguage(nextLanguage)
  }

  function cancelProfileEdit() {
    setProfileForm(createProfileForm(validatedProfile))
    setProfileError('')
    setShowOnboarding(!hasUsableProfile(validatedProfile))
  }

  function saveProfile(event) {
    event.preventDefault()
    setProfileError('')

    const result = profileDraftToProfile(profileForm)

    if (!result.profile) {
      setProfileError(Object.values(result.errors)[0] || 'Profilen kunde inte sparas.')
      return
    }

    setProfile(result.profile)
    setProfileForm(createProfileForm(result.profile))
    setShowOnboarding(false)
  }

  async function handleSignIn(credentials) {
    setAuthError('')
    setAuthNotice('')
    setAuthLoading(true)
    clearSharedAnalyticsCache()

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
    clearSharedAnalyticsCache()

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
    clearSharedAnalyticsCache()

    const { error } = await signOut()

    if (error) {
      setAuthError(getAuthErrorMessage(error))
    } else {
      setAuthSession(null)
    }

    setAuthLoading(false)
  }

  const updateCheckIn = useCallback((key, value) => {
    setCheckIn((current) => ({ ...current, [key]: value }))
  }, [])

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
    const { analyzeMealPhoto } = await import('./services/mealAnalysisService.js')

    return analyzeMealPhoto({
      checkIn,
      foods,
      image,
      meals,
      profile: getValidatedProfile(),
    })
  }

  function trackPremiumCounter(counter) {
    incrementPremiumAnalyticsCounter(counter, {
      userId: authUserId || 'local-user',
    })
  }

  async function analyzePhotoMeal() {
    if (!foodPhotoPreview) {
      return
    }

    setPhotoAnalysisStatus('Analyserar måltid...')

    try {
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
      trackPremiumCounter(premiumAnalyticsCounters.nutritionAnalyses)
      setPhotoAnalysisStatus('')
    } catch (error) {
      setPhotoAnalysisStatus(getSafeErrorMessage(error, { area: 'network' }))
    }
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
    const nextSettings = { ...reminderSettings, [key]: value }
    setReminderSettings(nextSettings)
    setReminderState((currentState) => syncLegacyReminderSettingsToV2(currentState, nextSettings))
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

  function handleReminderStateChange(nextState) {
    setReminderState(nextState)
  }

  function handleReminderComplete(reminderId) {
    setReminderState((current) => completeReminder(current, reminderId))
  }

  function handleReminderSnooze(reminderId, minutes) {
    setReminderState((current) => snoozeReminder(current, reminderId, minutes))
  }

  function handleReminderSkip(reminderId) {
    setReminderState((current) => skipReminder(current, reminderId))
  }

  function openReminderCenter() {
    scrollTargetInApp(document.getElementById('reminder-center'))
  }

  function getValidatedProfile() {
    return validatedProfile
  }

  function getAiCoachAppData() {
    return {
      bodyAnalysisHistory,
      checkIn,
      clothingAdvice: avatarLiveContextRef.current.clothingAdvice,
      foods,
      goalsHabits,
      healthSnapshot,
      latestWeeklyReport: weeklyReportData,
      liveWeather: avatarLiveContextRef.current.liveWeather,
      mealHistory: photoMeals,
      meals,
      nutritionGoals,
      progressGoalSettings,
      profile: validatedProfile,
      reminderState,
      surface: avatarLiveContextRef.current.surface,
      today: selectedMealDate,
      weights: scopedWeights,
    }
  }

  async function requestChatReply(message, chatHistoryOverride = null) {
    const sourceChatHistory = chatHistoryOverride || chatMessages

    return requestCoachChatReply({
      appData: getAiCoachAppData(),
      chatHistory: sourceChatHistory,
      fallbackReply: () => makeChatResponse(
        message,
        scopedProfile,
        checkIn,
        foods,
        centralCurrentWeight,
        sourceChatHistory,
        healthSnapshot.weight.dailyWeights,
        healthSnapshot.nutrition.mealsToday,
      ),
      message,
    })
  }

  function appendChatMessage(role, text, source = '', createdAt = new Date().toISOString()) {
    setChatMessages((current) => [
      ...current,
      {
        createdAt,
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
    if (chatRequestInFlightRef.current) {
      return ''
    }

    chatRequestInFlightRef.current = true
    const createdAt = new Date().toISOString()
    const { addMemory, pendingChatHistory } = await prepareCoachChatSubmission({
      chatMessages: chatMessagesRef.current,
      createdAt,
      text,
    })

    appendChatMessage('user', text, '', createdAt)
    addMemory({
      feature: 'ai-coach',
      role: 'user',
      text,
    })

    try {
      const result = await requestChatReply(text, pendingChatHistory)
      const isLocalFallback = result.source !== 'openai'

      setChatEngineStatus(
        isLocalFallback
          ? 'AI-coachen använder lokal fallback just nu.'
          : '',
      )
      appendChatMessage('assistant', result.reply, result.source)
      addMemory({
        feature: 'ai-coach',
        role: 'assistant',
        text: result.reply,
      })
      trackPremiumCounter(premiumAnalyticsCounters.aiCoachMessages)
      return result.reply
    } catch (error) {
      const reply = getSafeErrorMessage(error, { area: 'ai' })

      setChatEngineStatus('AI-coachen kunde inte svara just nu.')
      appendChatMessage('assistant', reply, 'mock')
      trackPremiumCounter(premiumAnalyticsCounters.aiCoachMessages)
      return reply
    } finally {
      chatRequestInFlightRef.current = false
    }
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

  function stopAllVoiceSessions() {
    realtimeVoiceRef.current?.stop()
    voiceConversationRef.current?.stop()
    setIsVoiceMuted(false)
  }

  async function startVoiceInput() {
    if (realtimeVoiceRef.current?.isActive()) {
      realtimeVoiceRef.current.stop()
      return
    }

    if (voiceConversationRef.current?.isActive()) {
      voiceConversationRef.current.stop()
      return
    }

    realtimeVoiceRef.current = createRealtimeVoiceController({
      connectRealtime: connectOpenAiRealtimeWebRtc,
      getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      onStatus: setVoiceStatus,
      requestSession: () => requestCoachRealtimeSession({
        appData: getAiCoachAppData(),
        chatHistory: chatMessagesRef.current,
      }),
      setActive: setIsVoiceConversationActive,
      setListening: setIsListening,
      setMuted: setIsVoiceMuted,
      setSpeaking: setIsAiSpeaking,
    })

    const realtimeResult = await realtimeVoiceRef.current.start()
    if (realtimeResult?.ok) {
      trackPremiumCounter(premiumAnalyticsCounters.voiceSessions)
      return
    }
    if (realtimeResult?.reason === 'denied') {
      return
    }

    voiceConversationRef.current = createVoiceConversationController({
      onTranscript: async (transcript) => {
        setChatInput(transcript)
        setChatInput('')
        return sendChatText(transcript)
      },
      isSpeechEnabled: () => isAiVoiceEnabledRef.current,
      onSpeechStart: () => trackPremiumCounter(premiumAnalyticsCounters.aiVoiceReplies),
      setActive: setIsVoiceConversationActive,
      setListening: setIsListening,
      setSpeaking: setIsAiSpeaking,
      setStatus: setVoiceStatus,
    })

    const started = await voiceConversationRef.current.start()
    if (started) {
      trackPremiumCounter(premiumAnalyticsCounters.voiceSessions)
    }
  }

  function stopAiVoiceResponse() {
    voiceConversationRef.current?.stopSpeakingAndResume?.()
  }

  function toggleVoiceMute() {
    const nextMuted = !isVoiceMuted
    realtimeVoiceRef.current?.setMicrophoneMuted?.(nextMuted)
    setIsVoiceMuted(nextMuted)
  }

  function closeAiCoachOverlay() {
    stopAllVoiceSessions()
    setAiCoachOverlayOpen(false)
    setVoiceStatus('')
  }

  function handleAiVoiceEnabledChange(enabled) {
    setIsAiVoiceEnabled(enabled)
    if (!enabled) {
      voiceConversationRef.current?.stopSpeakingAndResume?.()
    }
  }

  function handleStarterPrompt(prompt) {
    void sendChatText(prompt)
  }

  const getScrollBehavior = useCallback(() => {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  }, [])

  const scrollAppToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: getScrollBehavior() })
  }, [getScrollBehavior])

  const scrollTargetInApp = useCallback((target, options = {}) => {
    if (!target) {
      scrollAppToTop()
      return
    }

    target.scrollIntoView({
      behavior: getScrollBehavior(),
      block: options.block || 'start',
    })
  }, [getScrollBehavior, scrollAppToTop])

  function handleAppSectionChange(sectionId) {
    if (sectionId === 'social' && !socialUiEnabled) return
    if (sectionId === 'progress') {
      setMoreIntent({ id: Date.now(), targetId: 'mal-framsteg' })
      setActiveAppSection('more')
      return
    }
    if (sectionId === 'nutrition') {
      setMoreIntent({ id: Date.now(), targetId: 'mat' })
      setActiveAppSection('more')
      return
    }
    if (sectionId === 'coach') {
      setMoreIntent({ id: Date.now(), targetId: 'ai-coach' })
      setActiveAppSection('more')
      return
    }
    if (sectionId === 'wellbeing') {
      setMoreIntent({ id: Date.now(), targetId: 'ma-bra' })
      setActiveAppSection('more')
      return
    }
    if (sectionId === 'economy') {
      setMoreIntent({ id: Date.now(), targetId: 'ekonomi' })
      setActiveAppSection('more')
      return
    }
    const moreFolder = resolveMoreFolderFromTarget(sectionId)
    if (moreFolder) {
      setMoreIntent({ id: Date.now(), targetId: moreFolder })
      setActiveAppSection('more')
      return
    }

    logNavigationOrigin('app-section-change:before', { sectionId })
    setActiveAppSection(sectionId)

    window.requestAnimationFrame(() => {
      scrollAppToTop()
      logNavigationOrigin('app-section-change:after-frame', { sectionId })
    })
  }

  function handleGlobalSearchNavigate(result) {
    const requestedSection = result?.section || 'home'
    const isMoreDestination = ['progress', 'nutrition', 'coach', 'wellbeing', 'economy'].includes(requestedSection)
    const sectionId = isMoreDestination ? 'more' : requestedSection
    const targetId = result?.targetId
      || (requestedSection === 'nutrition' ? 'mat' : requestedSection === 'coach' ? 'ai-coach' : requestedSection === 'wellbeing' ? 'ma-bra' : requestedSection === 'economy' ? 'ekonomi' : requestedSection === 'progress' ? 'mal-framsteg' : `app-section-${requestedSection}`)

    logNavigationOrigin('global-search-navigate:before', {
      resultId: result?.id || '',
      sectionId,
      targetId,
    })
    if (sectionId === 'more') {
      setMoreIntent({ id: Date.now(), targetId })
    }
    setActiveAppSection(sectionId)

    const tryScrollToSearchTarget = () => {
      const target = document.getElementById(targetId) || document.getElementById(`app-section-${sectionId}`)

      scrollTargetInApp(target)

      if (target && !target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1')
      }
      target?.focus?.({ preventScroll: true })
      logNavigationOrigin('global-search-navigate:after-frame', {
        resultId: result?.id || '',
        sectionId,
        targetFound: Boolean(target),
        targetId,
      })
    }

    window.requestAnimationFrame(tryScrollToSearchTarget)
    if (sectionId === 'more') {
      window.setTimeout(tryScrollToSearchTarget, 120)
      window.setTimeout(tryScrollToSearchTarget, 420)
    }
  }

  const handleDailyCoachAction = useCallback((sectionId, targetId) => {
    logNavigationOrigin('section-target-navigation:before', { sectionId, targetId: targetId || '' })

    if (sectionId === 'nutrition' && (targetId === 'nutrition-scanner-v2' || targetId === 'scanner')) {
      setNutritionIntent({ id: Date.now(), panel: 'scanner' })
    }

    if (sectionId === 'progress') {
      setProgressIntent({ id: Date.now(), targetId: 'body-analysis' })
      setMoreIntent({ id: Date.now(), targetId: targetId || 'mal-framsteg' })
      setActiveAppSection('more')
    } else if (sectionId === 'nutrition') {
      setMoreIntent({ id: Date.now(), targetId: targetId || 'mat' })
      setActiveAppSection('more')
    } else if (sectionId === 'coach') {
      setMoreIntent({ id: Date.now(), targetId: targetId || 'ai-coach' })
      setActiveAppSection('more')
    } else if (sectionId === 'wellbeing') {
      setMoreIntent({ id: Date.now(), targetId: targetId || 'ma-bra' })
      setActiveAppSection('more')
    } else if (sectionId === 'economy') {
      setMoreIntent({ id: Date.now(), targetId: targetId || 'ekonomi' })
      setActiveAppSection('more')
    } else {
      setActiveAppSection(sectionId)
    }

    window.requestAnimationFrame(() => {
      const target = targetId ? document.getElementById(targetId) : null

      if (target) {
        scrollTargetInApp(target)
      } else {
        scrollAppToTop()
      }

      logNavigationOrigin('section-target-navigation:after-frame', {
        sectionId,
        targetFound: Boolean(target),
        targetId: targetId || '',
      })

      if (sectionId === 'progress' && (targetId === 'body-analysis' || targetId === 'framstegsbilder')) {
        window.requestAnimationFrame(() => {
          const bodyScanner = document.getElementById('body-analysis')

          scrollTargetInApp(bodyScanner)
          bodyScanner?.setAttribute('tabindex', '-1')
          bodyScanner?.focus?.({ preventScroll: true })
        })
      }
    })
  }, [scrollAppToTop, scrollTargetInApp])

  const handleDailyCoachAddMeal = useCallback(() => {
    handleDailyCoachAction('nutrition', 'mat')
  }, [handleDailyCoachAction])

  const handleDailyCoachLogWeight = useCallback(() => {
    handleDailyCoachAction('progress', 'vikt')
  }, [handleDailyCoachAction])

  function handleDailyCoachScanFood() {
    logNavigationOrigin('home-scan-food:before', { sectionId: 'nutrition', targetId: 'nutrition-scanner-v2' })
    setNutritionIntent({ id: Date.now(), panel: 'scanner' })
    handleDailyCoachAction('nutrition', 'nutrition-scanner-v2')
  }
  const syncStatusSnapshot = getSyncStatusSnapshot()
  const syncStatusWithUser = {
    ...syncStatusSnapshot,
    userId: authSession?.user?.id || '',
  }

  if (authLoading) {
    return <AppLoadingScreen />
  }

  if (!authSession) {
    return (
      <>
        <PwaExperience />
        <AuthPanel
          authError={authError}
          authLoading={authLoading}
          authNotice={authNotice}
          authStatus={authStatus}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
      </>
    )
  }

  if (showOnboarding) {
    return (
      <OnboardingScreen
        activityOptions={activityOptions}
        goalOptions={goalOptions}
        onCancel={hasUsableProfile(validatedProfile) ? cancelProfileEdit : null}
        onProfileFormChange={updateProfileForm}
        onSubmit={saveProfile}
        profileCompleteness={profileFormCompleteness}
        profileError={profileError}
        profileForm={profileForm}
      />
    )
  }

  return (
    <main className="app-shell">
        <PwaExperience showDiagnostics={showInternalTools} />
        <GlobalSyncStatus />
        <ReminderBanner
          dueReminders={dueReminders}
          onComplete={handleReminderComplete}
          onOpenCenter={openReminderCenter}
          onSkip={handleReminderSkip}
          onSnooze={handleReminderSnooze}
        />
        {showInternalTools && (
          <Suspense fallback={null}>
            <LaunchReadinessPanel
              authSession={authSession}
              healthSnapshot={healthSnapshot}
              reminderState={reminderState}
              syncStatus={syncStatusWithUser}
            />
            <ManualAcceptanceRunner
              syncStatus={syncStatusWithUser}
            />
            <PremiumAnalyticsPanel
              userId={authUserId || 'local-user'}
            />
          </Suspense>
        )}
        {activeAppSection === 'home' && (
          <HomeSection
            activeSection={activeAppSection}
            adaptiveCoachFeedback={adaptiveCoachFeedback}
            calorieGoal={nutritionGoals?.calories}
            caloriesToday={dailyNutritionSummary?.totals.calories ?? 0}
            chatInput={chatInput}
            checkIn={checkIn}
            currentWeight={centralCurrentWeight}
            dashboardData={dashboardData}
            email={authSession?.user?.email || ''}
            foods={foods}
            goalsHabits={goalsHabits}
            healthDashboardPeriod={healthDashboardPeriod}
            healthSnapshot={healthSnapshot}
            isAiSpeaking={isAiSpeaking}
            isAuthenticated={Boolean(authSession)}
            isListening={isListening}
            isVoiceConversationActive={isVoiceConversationActive}
            isVoiceMuted={isVoiceMuted}
            meals={meals}
            nutritionGoals={nutritionGoals}
            onAddMeal={handleDailyCoachAddMeal}
            onAvatarLiveContextChange={(next) => {
              avatarLiveContextRef.current = { ...avatarLiveContextRef.current, ...next }
            }}
            onAvatarSurfaceChange={(surface) => {
              avatarLiveContextRef.current.surface = surface || 'coach'
            }}
            onChatInputChange={setChatInput}
            onEditProfile={() => setShowOnboarding(true)}
            onHealthDashboardPeriodChange={setHealthDashboardPeriod}
            onLogWeight={handleDailyCoachLogWeight}
            onNavigateSection={handleDailyCoachAction}
            onOpenAiCoach={() => setAiCoachOverlayOpen(true)}
            onOpenWellbeing={() => handleDailyCoachAction('wellbeing', 'ma-bra')}
            onScanFood={handleDailyCoachScanFood}
            onSendChatMessage={sendChatMessage}
            onStartVoiceInput={startVoiceInput}
            onStopAiVoiceResponse={stopAiVoiceResponse}
            onToggleVoiceMute={toggleVoiceMute}
            onVoiceCleanup={stopAllVoiceSessions}
            profile={validatedProfile}
            progressInsights={progressInsights}
            proteinGoal={dailyNutritionSummary?.proteinGoal ?? nutritionGoals?.protein}
            proteinToday={dailyNutritionSummary?.totals.protein ?? 0}
            reminderState={reminderState}
            selectedMealDate={selectedMealDate}
            syncStatus={syncStatusSnapshot}
            userId={authUserId || 'local-user'}
            voiceStatus={voiceStatus}
            weights={centralWeightStats.weights}
          />
        )}
        {aiCoachOverlayOpen && (
          <AiCoachOverlay
            canClearChat={chatMessages.length > initialChatMessages.length}
            chatEngineStatus={chatEngineStatus}
            chatInput={chatInput}
            chatMessages={chatMessages}
            chatThreadRef={chatThreadRef}
            isAiSpeaking={isAiSpeaking}
            isAiVoiceEnabled={isAiVoiceEnabled}
            isListening={isListening}
            isVoiceConversationActive={isVoiceConversationActive}
            isVoiceMuted={isVoiceMuted}
            messagesEndRef={messagesEndRef}
            onAiVoiceEnabledChange={handleAiVoiceEnabledChange}
            onChatInputChange={setChatInput}
            onClearChat={clearChat}
            onClose={closeAiCoachOverlay}
            onSendChatMessage={sendChatMessage}
            onStartVoiceInput={startVoiceInput}
            onStarterPrompt={handleStarterPrompt}
            onStopAiVoiceResponse={stopAiVoiceResponse}
            onToggleVoiceMute={toggleVoiceMute}
            starterPrompts={aiStarterPrompts}
            voiceStatus={voiceStatus}
          />
        )}

        {activeAppSection !== 'home' && (
          <Suspense fallback={<LazySectionFallback />}>
          <section className="content-grid">
        {activeAppSection === 'redo' && (
          <ReadySection
            activeSection={activeAppSection}
            onNavigateSection={handleAppSectionChange}
            onOpenCompanion={() => setAiCoachOverlayOpen(true)}
            reminderState={reminderState}
          />
        )}

        {activeAppSection === 'place' && (
          <PlaceSection activeSection={activeAppSection} />
        )}

        {activeAppSection === 'notices' && reminderHubUiEnabled && (
          <NoticesSection
            activeSection={activeAppSection}
            onRemindersChange={handleReminderStateChange}
            reminderState={reminderState}
            t={t}
          />
        )}

        {activeAppSection === 'more' && (
          <MoreSection
  activeSection={activeAppSection}
  adaptiveCoachFeedback={adaptiveCoachFeedback}
  authLoading={authLoading}
  checkIn={checkIn}
  email={authSession?.user?.email || ''}
  goalsHabits={goalsHabits}
  healthSnapshot={healthSnapshot}
  isAuthenticated={Boolean(authSession)}
  language={currentLanguage}
  meals={meals}
  navigationIntent={moreIntent}
  nutritionGoals={nutritionGoals}
  onDataRestored={refreshAppStateFromStorage}
  onNavigationIntentConsumed={() => setMoreIntent(null)}
  onEditProfile={() => setShowOnboarding(true)}
  onLanguageChange={handleLanguageChange}
  onOpenAiCoach={() => setAiCoachOverlayOpen(true)}
  WellbeingSectionComponent={WellbeingSection}
  wellbeingSectionProps={{ profile: validatedProfile }}
  EconomySectionComponent={EconomySection}
  onReminderSettingChange={updateReminderSetting}
  onReminderStateChange={handleReminderStateChange}
   onRequestNotificationPermission={requestNotificationPermission}
  onSearchNavigate={handleGlobalSearchNavigate}
  onSignOut={handleSignOut}
  profileCompleteness={profileCompleteness}
  reminderOptions={reminderOptions}
  reminderSettings={reminderSettings}
  reminderState={reminderState}
  reminderStatus={reminderStatus}
  schedulerStatus={reminderSchedulerStatus}
  selectedMealDate={selectedMealDate}
  DataExportCenterComponent={DataExportCenter}
  DataImportCenterComponent={DataImportCenter}
  SyncHealthDashboardComponent={SyncHealthDashboard}
  syncStatus={syncStatusSnapshot}
  showInternalTools={showInternalTools}
  userId={authSession?.user?.id || ''}
  profile={validatedProfile}
  weights={centralWeightStats.weights}
  ProgressSectionComponent={ProgressSection}
  NutritionSectionComponent={NutritionSection}
  CoachSectionComponent={CoachSection}
  nutritionNavigationIntent={nutritionIntent}
  coachSectionProps={{
    adaptiveCoachFeedback,
    aiStarterPrompts,
    canClearChat: chatMessages.length > initialChatMessages.length,
    chatEngineStatus,
    chatInput,
    chatMessages,
    chatThreadRef,
    checkIn,
    coachMessage,
    coachReport: latestCoachReport || currentCoachPreview,
    coachReports,
    coachStatus,
    goalsHabits,
    healthSnapshot,
    isGeneratingCoachReport,
    isAiSpeaking,
    isAiVoiceEnabled,
    isListening,
    isVoiceConversationActive,
    meals,
    messagesEndRef,
    nutritionGoals,
    onAdaptiveCoachFeedbackChange: setAdaptiveCoachFeedback,
    onChatInputChange: setChatInput,
    onClearChat: clearChat,
    onClearCoachReports: clearCoachReports,
    onCoachQuestion: (question) => { void sendChatText(question) },
    onCreateCoachReport: createCoachReport,
    onDeleteCoachReport: deleteCoachReport,
    onRecommendationFeedback: handleCoachRecommendationFeedback,
    onGoalsHabitsChange: setGoalsHabits,
    onAiVoiceEnabledChange: handleAiVoiceEnabledChange,
    onStopAiVoiceResponse: stopAiVoiceResponse,
    onReminderStateChange: handleReminderStateChange,
    onSendChatMessage: sendChatMessage,
    onStartVoiceInput: startVoiceInput,
    onStarterPrompt: handleStarterPrompt,
    profile: validatedProfile,
    reminderState,
    selectedMealDate,
    voiceStatus,
    weights: centralWeightStats.weights,
  }}
  nutritionSectionProps={{
    barcodeInput,
    barcodeScannerActive,
    barcodeStatus,
    barcodeVideoRef,
    checkIn,
    displayPhotoMeals,
    favoriteMeals,
    foodPhotoPreview,
    foods,
    foodScore,
    handleFoodPhotoChange,
    healthSnapshot,
    mealHistoryImportSummary,
    meals,
    nutritionGoals,
    onScrollToTarget: scrollTargetInApp,
    onAnalyzePhotoMeal: analyzePhotoMeal,
    onBarcodeInputChange: setBarcodeInput,
    onCancelClearMealHistory: () => setShowClearMealHistoryConfirm(false),
    onClearMealHistory: clearLocalMealHistory,
    onCreateDemoMealDay: createDemoMealAnalysisDay,
    onExportMealHistory: exportMealAnalysisHistory,
    onFavoriteMealsChange: (nextFavorites) => setFavoriteMeals(normalizeFavoriteMeals(nextFavorites)),
    onFoodToggle: toggleFood,
    onImportMealHistory: importMealAnalysisHistory,
    onMealsChange: (nextMeals) => setMeals(normalizeMeals(nextMeals)),
    onNutritionGoalsChange: (nextGoals) => setNutritionGoals(normalizeNutritionGoals(nextGoals)),
    onSelectedMealDateChange: setSelectedMealDate,
    onShowClearMealHistory: () => setShowClearMealHistoryConfirm(true),
    onStartBarcodeScanner: startBarcodeScanner,
    onStopBarcodeScanner: stopBarcodeScanner,
    onSubmitManualBarcode: submitManualBarcode,
    onUpdateCheckIn: updateCheckIn,
    photoAnalysisStatus,
    profile: scopedProfile,
    scannedProducts,
    selectedMealDate,
    showClearMealHistoryConfirm,
    userId: authUserId || 'local-user',
    weights: scopedWeights,
    weekSummary: mealWeekSummary,
  }}
  progressSectionProps={{
    adaptiveCoachFeedback,
    afterPhoto,
    beforeAfterPhotos,
    beforePhoto,
    bodyAnalysisHistory,
    bodyMeasurements,
    checkIn,
    createWeeklyReport,
    foods,
    goalSettings: progressGoalSettings,
    goalsHabits,
    healthSnapshot,
    meals,
    monthlyReport,
    navigationIntent: progressIntent || moreIntent,
    onScrollToTarget: scrollTargetInApp,
    nutritionGoals,
    onAfterPhotoIdChange: setAfterPhotoId,
    onBeforePhotoIdChange: setBeforePhotoId,
    onBodyMeasurementsChange: (nextMeasurements) => setBodyMeasurements(normalizeBodyMeasurements(nextMeasurements)),
    onDeleteProgressPhoto: (photoId) => {
      if (window.confirm('Vill du ta bort den här framstegsbilden?')) {
        setProgressPhotos((current) => current.filter((photo) => photo.id !== photoId))
      }
    },
    onGoalSettingsChange: (nextSettings) => setProgressGoalSettings(normalizeGoalSettings(nextSettings)),
    onProgressPhotoChange: handleProgressPhotoChange,
    onProgressPhotoNoteChange: setProgressPhotoNote,
    onProgressReportsChange: setProgressReports,
    onUpdateProgressPhoto: (photoId, updates) => setProgressPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, ...updates, updatedAt: new Date().toISOString() } : photo)),
    onWeightsChange: (nextWeights) => setWeights(normalizeWeights(nextWeights)),
    profile: validatedProfile,
    progressPhotoComparison,
    progressPhotoComparisonImages,
    progressPhotoItems,
    progressPhotoNote,
    progressPhotoOptions,
    progressPhotos,
    progressReports,
    selectedMealDate,
    userId: authUserId || 'local-user',
    weights: centralWeightStats.weights,
    weeklyReportData,
    weeklyReportLines,
    weeklyReportStatus,
  }}
/>
        )}
        {activeAppSection === 'social' && socialUiEnabled && (
          <AppSection
            activeSection={activeAppSection}
            id="social"
            label={t('sections.social.aria')}
          >
            <SocialRoom
              enabled={socialUiEnabled}
              isAuthenticated={Boolean(authSession)}
              liveEnabled={isFeatureEnabled('socialLive', featureFlags)}
              mediaActive={isVoiceConversationActive}
            />
          </AppSection>
        )}
          </section>
          </Suspense>
        )}
      <BottomNavigation
        activeSection={activeAppSection}
        onSectionChange={handleAppSectionChange}
        showNotices={reminderHubUiEnabled}
        showSocial={socialUiEnabled}
      />
    </main>
  )
}

export default App
