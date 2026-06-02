import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

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

const mealOptions = ['Frukost', 'Lunch', 'Middag', 'Mellanmål']

const goalOptions = ['gå ner i vikt', 'hålla vikten', 'bygga muskler']

const activityOptions = ['Låg', 'Medel', 'Hög']

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
        typeof entry.note === 'string',
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

function parseWeight(value) {
  return Number(String(value).replace(',', '.'))
}

function isValidWeightInput(value) {
  const numericValue = parseWeight(value)

  return Number.isFinite(numericValue) && numericValue > 0
}

function makeMockPhotoAnalysis(profile, checkIn, foods) {
  const completedFoods = foods.filter((item) => item.done).length
  const goalAdjustment =
    profile?.goal === 'bygga muskler'
      ? { calories: 120, protein: 12, carbs: 12, fat: 2 }
      : profile?.goal === 'gå ner i vikt'
        ? { calories: -70, protein: 4, carbs: -10, fat: -2 }
        : { calories: 0, protein: 6, carbs: 0, fat: 0 }
  const activityAdjustment =
    profile?.activityLevel === 'Hög'
      ? { calories: 80, carbs: 12 }
      : profile?.activityLevel === 'Låg'
        ? { calories: -40, carbs: -6 }
        : { calories: 0, carbs: 0 }
  const energyAdjustment = checkIn.energy <= 3 ? 60 : 0
  const checklistAdjustment = completedFoods >= 3 ? -20 : 35
  const calories =
    520 + goalAdjustment.calories + activityAdjustment.calories + energyAdjustment + checklistAdjustment

  return {
    foods: ['protein', 'grönsaker', 'kolhydratkälla'],
    calories,
    protein: 32 + goalAdjustment.protein,
    carbs: 54 + goalAdjustment.carbs + activityAdjustment.carbs,
    fat: 18 + goalAdjustment.fat,
    confidence: 'låg',
    explanation:
      'Mockanalysen uppskattar en balanserad måltid utifrån bilden och dagens data. Använd siffrorna som en grov riktning, inte som exakta näringsvärden.',
  }
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
      text.includes('läggdags') ||
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

function makeChatResponse(
  message,
  profile,
  checkIn,
  foods,
  currentWeight,
  chatHistory = [],
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

  if (asksIfHarmful(message) && hasBedtimeEatingContext(message, chatHistory)) {
    return 'För de flesta är det inte skadligt att äta nära läggdags. Däremot kan det påverka sömn, reflux, hungervanor eller göra det lättare att äta mer än man tänkt för vissa. Om du är hungrig sent kan du testa något lättare, som yoghurt, ägg, keso eller en liten macka. Prova också att ändra tajming och portionsstorlek några kvällar och se hur kroppen reagerar.'
  }

  if (asksIfHarmful(message)) {
    return 'Oftast beror det på vad det gäller, mängd och hur du mår av det. Det är sällan en enskild vana är “skadlig” i sig, men den kan påverka sömn, energi, mage eller rutiner. Berätta gärna vad du syftar på, så kan jag svara mer konkret.'
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

  if (text.includes('ikväll') || text.includes('middag') || text.includes('äta')) {
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

  if (text.includes('billig') || text.includes('proteinrik') || text.includes('lunch')) {
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

function makeLocalWeeklyReport(profile, checkIn, foods, meals, weights) {
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hållbara vanor'
  const recentWeights = weights.slice(-7)
  const weeklyChange = getAverageWeeklyChange(recentWeights)
  const checklistScore = `${foods.filter((item) => item.done).length}/${foods.length}`
  const goalFocus =
    goal === 'gå ner i vikt'
      ? 'Fortsätt med enkla måltider och jämn rörelse.'
      : goal === 'bygga muskler'
        ? 'Prioritera protein och återhämtning.'
        : 'Håll rutinen stabil och lätt att upprepa.'

  return `### Veckorapport
• ${name}: ${goalFocus}
• Vikttrend: ${weeklyChange > 0 ? '+' : ''}${formatWeight(weeklyChange)} per vecka.
• Mat: ${meals.length} loggade måltider, checklista ${checklistScore}.
• Aktivitet: ${checkIn.steps.toLocaleString('sv-SE')} steg, energi ${checkIn.energy}/10.

Nästa steg: planera två proteinbaser för veckan.`
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
  const [photoAnalysisStatus, setPhotoAnalysisStatus] = useState('')
  const [photoMeals, setPhotoMeals] = useState(() =>
    readStoredValue(
      storageKeys.photoMeals,
      initialPhotoMeals,
      isStoredPhotoMeals,
    ),
  )
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
  const safeProfileGoalWeight =
    profile?.goal === 'gå ner i vikt'
      ? formatOptionalWeight(profile?.goalWeight)
      : ''
  const profileSummaryParts = [
    profile?.goal,
    safeProfileGoalWeight ? `mål ${safeProfileGoalWeight}` : '',
    profile?.activityLevel ? `aktivitet ${profile.activityLevel}` : '',
  ].filter(Boolean)
  const habitScore = Math.round(
    ((checkIn.energy >= 6 ? 1 : 0) +
      (checkIn.steps >= 7000 ? 1 : 0) +
      (checkIn.workout ? 1 : 0) +
      foodScore / foods.length) *
      25,
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
    : demoMode && !showOnboarding
      ? 'Uppdaterar AI-coach...'
      : ''

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
    writeStoredValue(storageKeys.photoMeals, photoMeals)
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
    writeStoredValue(storageKeys.checkIn, checkIn)
  }, [checkIn])

  useEffect(() => {
    if (profile) {
      writeStoredValue(storageKeys.profile, profile)
    }
  }, [profile])

  useEffect(
    () => () => {
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
    try {
      console.info('[Viktkollen meal] Calling /api/analyze-meal')

      const apiResponse = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          profile: getValidatedProfile(),
          checkIn,
          foods,
          meals,
        }),
      })

      if (!apiResponse.ok) {
        throw new Error(`Meal API failed with status ${apiResponse.status}`)
      }

      const data = await apiResponse.json()

      console.info('[Viktkollen meal] /api/analyze-meal response', {
        source: data.source,
        fallbackReason: data.fallbackReason,
        debug: data.debug,
      })

      if (data.analysis) {
        return data.analysis
      }
    } catch (error) {
      console.warn('[Viktkollen meal] API unavailable, using mock analysis', {
        reason: error instanceof Error ? error.message : String(error),
      })
    }

    return makeMockPhotoAnalysis(profile, checkIn, foods)
  }

  async function analyzePhotoMeal() {
    if (!foodPhotoPreview) {
      return
    }

    setPhotoAnalysisStatus('Analyserar måltid...')
    const analysis = await requestMealAnalysis(foodPhotoPreview)
    setPhotoMeals((current) => [
      {
        id: Date.now(),
        image: foodPhotoPreview,
        createdAt: new Date().toISOString(),
        analysis,
      },
      ...current.slice(0, 4),
    ])
    setPhotoAnalysisStatus('')
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

  function handleProgressPhotoChange(event) {
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

  async function createWeeklyReport() {
    setWeeklyReportStatus('Skapar veckorapport...')

    try {
      console.info('[Viktkollen weekly report] Calling /api/weekly-report')

      const apiResponse = await fetch('/api/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: getValidatedProfile(),
          checkIn,
          foods,
          meals,
          weights,
          currentWeight: latestWeight.value,
        }),
      })

      if (!apiResponse.ok) {
        throw new Error(`Weekly report API failed with status ${apiResponse.status}`)
      }

      const data = await apiResponse.json()

      console.info('[Viktkollen weekly report] /api/weekly-report response', {
        source: data.source,
        fallbackReason: data.fallbackReason,
        debug: data.debug,
      })

      if (typeof data.report === 'string' && data.report.trim()) {
        setWeeklyReport(data.report.trim())
        setWeeklyReportStatus(
          data.source === 'openai'
            ? 'AI-genererad veckorapport.'
            : 'Lokal fallback används just nu.',
        )
        return
      }
    } catch (error) {
      console.warn('[Viktkollen weekly report] API unavailable, using mock', {
        reason: error instanceof Error ? error.message : String(error),
      })
    }

    setWeeklyReport(makeLocalWeeklyReport(profile, checkIn, foods, meals, weights))
    setWeeklyReportStatus('Lokal fallback används just nu.')
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

  async function sendChatText(text) {
    appendChatMessage('user', text)
    const reply = await requestChatReply(text)
    appendChatMessage('assistant', reply)
  }

  function sendChatMessage(event) {
    event.preventDefault()
    const text = chatInput.trim()

    if (!text) {
      return
    }

    setChatInput('')
    void sendChatText(text)
  }

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceStatus(
        'Röstinmatning stöds inte i den här webbläsaren. Skriv frågan i stället.',
      )
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'sv-SE'
    recognition.continuous = false
    recognition.interimResults = false

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
        setChatInput(transcript)
        setVoiceStatus('Texten är ifylld. Du kan redigera innan du skickar.')
      }
    })

    recognition.addEventListener('error', () => {
      setVoiceStatus('Kunde inte lyssna just nu. Försök igen eller skriv frågan.')
    })

    recognition.addEventListener('end', () => {
      setIsListening(false)
      setVoiceStatus((current) => (current === 'Lyssnar...' ? '' : current))
    })

    recognition.start()
  }

  function handleStarterPrompt(prompt) {
    void sendChatText(prompt)
  }

  if (!demoMode) {
    return (
      <main className="app-shell welcome-shell">
        <section className="welcome-card">
          <p className="eyebrow">Välkommen</p>
          <h1>Viktkollen</h1>
          <p className="welcome-subtitle">
            Din personliga AI-coach för vikt, mat och vanor
          </p>
          <div className="welcome-actions">
            <button type="button" onClick={startDemo}>
              Starta demo
            </button>
            <button className="secondary-button" type="button" disabled>
              Logga in · kommer snart
            </button>
          </div>
          <p className="welcome-note">
            Ingen backend och ingen riktig inloggning ännu. Demon sparas bara i
            den här webbläsaren.
          </p>
        </section>
      </main>
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
            onClick={resetDemoMode}
          >
            Logga ut demo
          </button>
          <p className="disclaimer">
            Den här appen ger endast allmänt stöd för hälsa och välmående. Den är
            inte medicinsk rådgivning, diagnos eller behandling.
          </p>
        </div>
      </header>

      <section className="summary-grid" aria-label="Översikt">
        <article className="metric metric-primary">
          <span>Nuvarande vikt</span>
          <strong>
            {formatWeight(latestWeight.value)} (start:{' '}
            {formatWeight(startWeight.value)})
          </strong>
          <small>{formatWeight(weightChange)} sedan start</small>
        </article>
        <article className="metric">
          <span>Vanepoäng</span>
          <strong>{habitScore}%</strong>
          <small>Baserat på dagens check-in</small>
        </article>
        <article className="metric">
          <span>Matchecklista</span>
          <strong>
            {foodScore}/{foods.length}
          </strong>
          <small>Grundvanor för maten</small>
        </article>
        <article className="metric">
          <span>Steg i dag</span>
          <strong>{checkIn.steps.toLocaleString('sv-SE')}</strong>
          <small>{checkIn.workout ? 'Träning planerad' : 'Återhämtningsdag'}</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel check-in-panel" id="checkin">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Dagens check-in</p>
              <h2>Hur dagen går</h2>
            </div>
          </div>

          <label className="field">
            <span>Energi</span>
            <input
              type="range"
              min="1"
              max="10"
              value={checkIn.energy}
              onChange={(event) =>
                updateCheckIn('energy', Number(event.target.value))
              }
            />
            <strong>{checkIn.energy}/10</strong>
          </label>

          <label className="field">
            <span>Steg</span>
            <input
              type="number"
              min="0"
              step="100"
              value={checkIn.steps}
              onChange={(event) =>
                updateCheckIn('steps', Number(event.target.value))
              }
            />
          </label>

          <label className="field">
            <span>Humör</span>
            <select
              value={checkIn.mood}
              onChange={(event) => updateCheckIn('mood', event.target.value)}
            >
              <option>Fokuserad</option>
              <option>Lugn</option>
              <option>Trött</option>
              <option>Stressad</option>
            </select>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={checkIn.workout}
              onChange={(event) =>
                updateCheckIn('workout', event.target.checked)
              }
            />
            <span>Träning eller medveten rörelse genomförd</span>
          </label>
        </article>

        <article className="panel coach-panel" id="coach">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AI-coach</p>
              <h2>Dagens återkoppling</h2>
            </div>
          </div>
          <p className="coach-copy">{coachMessage}</p>
          <div className="coach-note">
            {coachStatus || 'AI-coachen använder dagens profil, vanor och loggar.'}
          </div>
        </article>

        <article className="panel chat-panel" id="chat">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Coachchatt</p>
              <h2>Fråga AI-coachen</h2>
            </div>
          </div>

          <div className="starter-prompts" aria-label="Förslag på frågor">
            {[
              'Vad ska jag äta ikväll?',
              'Ge mig ett hälsosamt mellanmål',
              'Hur håller jag motivationen?',
              'Billig proteinrik lunch?',
            ].map((prompt) => (
              <button
                className="prompt-chip"
                type="button"
                key={prompt}
                onClick={() => handleStarterPrompt(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="chat-thread" aria-live="polite">
            {chatMessages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                <span>{message.role === 'user' ? 'Du' : 'AI-coach'}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={sendChatMessage}>
            <input
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Skriv en fråga..."
            />
            <button
              className={`mic-button ${isListening ? 'listening' : ''}`}
              type="button"
              onClick={startVoiceInput}
              aria-label="Starta röstinmatning"
              title="Starta röstinmatning"
            >
              {isListening ? 'Lyssnar' : 'Mic'}
            </button>
            <button type="submit">Skicka</button>
          </form>
          {voiceStatus && (
            <p className="voice-status" aria-live="polite">
              {voiceStatus}
            </p>
          )}
          <p className="chat-safety-note">
            Svaren är allmänt wellness-stöd på svenska. Ingen medicinsk
            diagnos, behandling eller extrem diet.
          </p>
        </article>

        <article className="panel" id="vikt">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Viktlogg</p>
              <h2>Följ utvecklingen</h2>
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
            <button type="submit">Lägg till</button>
          </form>
          <div className="chart-card">
            <div className="chart-toolbar">
              <div>
                <span>Genomsnitt per vecka</span>
                <strong>
                  {averageWeeklyChange > 0 ? '+' : ''}
                  {formatWeight(averageWeeklyChange)}
                </strong>
              </div>
              <div className="segmented-control" aria-label="Välj tidsperiod">
                {chartRangeOptions.map((option) => (
                  <button
                    className={chartRange === option.value ? 'active' : ''}
                    type="button"
                    key={option.value}
                    onClick={() => setChartRange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="weight-chart" aria-label="Viktgraf med trendlinje">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img">
                <title>Viktutveckling</title>
                <line
                  x1={chartPadding}
                  y1={chartPadding}
                  x2={chartPadding}
                  y2={chartHeight - chartPadding}
                />
                <line
                  x1={chartPadding}
                  y1={chartHeight - chartPadding}
                  x2={chartWidth - chartPadding}
                  y2={chartHeight - chartPadding}
                />
                <polyline className="trend-line" points={trendPoints.join(' ')} />
                <polyline className="weight-line" points={chartPoints.join(' ')} />
                {chartPoints.map((point, index) => {
                  const [cx, cy] = point.split(',')

                  return (
                    <circle
                      key={`${chartWeights[index].date}-${chartWeights[index].value}`}
                      cx={cx}
                      cy={cy}
                      r="4.5"
                    />
                  )
                })}
              </svg>
            </div>

            <div className="chart-footer">
              <span>
                {chartWeights[0] ? formatFullDate(chartWeights[0].date) : ''}
              </span>
              <span>
                {chartWeights.at(-1)
                  ? formatFullDate(chartWeights.at(-1).date)
                  : ''}
              </span>
            </div>
          </div>
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

        <article className="panel meals-panel" id="maltider">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Snabbregistrera måltid</p>
              <h2>Måltidsnoteringar</h2>
            </div>
          </div>
          <form className="meal-form" onSubmit={addMeal}>
            <select
              value={mealType}
              onChange={(event) => setMealType(event.target.value)}
            >
              {mealOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Exempel: lax, ris, gurka"
              value={mealText}
              onChange={(event) => setMealText(event.target.value)}
            />
            <button type="submit">Lägg till måltid</button>
          </form>

          <div className="photo-meal-tool">
            <div>
              <p className="eyebrow">Matfoto</p>
              <h3>Mockanalys av måltid</h3>
              <p>
                Ladda upp eller ta en bild. Analysen är bara en grov uppskattning
                och ersätter inte exakta näringsvärden.
              </p>
            </div>
            <label className="photo-input">
              <span>Välj matfoto</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFoodPhotoChange}
              />
            </label>
            {foodPhotoPreview && (
              <img
                className="food-preview"
                src={foodPhotoPreview}
                alt="Förhandsvisning av måltid"
              />
            )}
            <button
              type="button"
              disabled={!foodPhotoPreview}
              onClick={analyzePhotoMeal}
            >
              Analysera måltid
            </button>
            {photoAnalysisStatus && (
              <p className="analysis-status">{photoAnalysisStatus}</p>
            )}
            <p className="estimate-note">
              Endast uppskattning från AI eller mockfallback. Ingen medicinsk
              rådgivning.
            </p>
          </div>

          {photoMeals.length > 0 && (
            <ul className="photo-meal-list">
              {photoMeals.map((entry) => (
                <li key={entry.id}>
                  <img src={entry.image} alt="Analyserad måltid" />
                  <div>
                    <strong>
                      {entry.analysis.calories} kcal uppskattat
                    </strong>
                    <p>
                      Livsmedel: {entry.analysis.foods.join(', ')}
                    </p>
                    <dl>
                      <div>
                        <dt>Protein</dt>
                        <dd>{entry.analysis.protein} g</dd>
                      </div>
                      <div>
                        <dt>Kolhydrater</dt>
                        <dd>{entry.analysis.carbs} g</dd>
                      </div>
                      <div>
                        <dt>Fett</dt>
                        <dd>{entry.analysis.fat} g</dd>
                      </div>
                      <div>
                        <dt>Säkerhet</dt>
                        <dd>{entry.analysis.confidence}</dd>
                      </div>
                    </dl>
                    <p>{entry.analysis.explanation}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <ul className="meal-list">
            {meals.map((meal) => (
              <li key={meal.id}>
                <strong>{meal.type}</strong>
                <span>{meal.text}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel scanner-panel" id="streckkod">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Streckkod</p>
              <h2>Skanna produkt</h2>
            </div>
          </div>

          <div className="scanner-tool">
            <video
              className="barcode-video"
              ref={barcodeVideoRef}
              muted
              playsInline
            />
            <div className="scanner-actions">
              <button type="button" onClick={startBarcodeScanner}>
                Starta kamera
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={stopBarcodeScanner}
                disabled={!barcodeScannerActive}
              >
                Stoppa
              </button>
            </div>
            {barcodeStatus && <p className="analysis-status">{barcodeStatus}</p>}
            <form className="inline-form" onSubmit={submitManualBarcode}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Skriv streckkod manuellt"
                value={barcodeInput}
                onChange={(event) => setBarcodeInput(event.target.value)}
              />
              <button type="submit">Spara</button>
            </form>
          </div>

          {scannedProducts.length > 0 && (
            <ul className="product-list">
              {scannedProducts.map((product) => (
                <li key={`${product.barcode}-${product.id}`}>
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.barcode}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Kalorier</dt>
                      <dd>{product.calories} kcal</dd>
                    </div>
                    <div>
                      <dt>Protein</dt>
                      <dd>{product.protein} g</dd>
                    </div>
                    <div>
                      <dt>Kolhydrater</dt>
                      <dd>{product.carbs} g</dd>
                    </div>
                    <div>
                      <dt>Fett</dt>
                      <dd>{product.fat} g</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel photos-panel" id="bilder">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Progressbilder</p>
              <h2>Bildtidslinje</h2>
            </div>
          </div>

          <div className="progress-upload">
            <label className="field">
              <span>Anteckning</span>
              <input
                type="text"
                placeholder="Exempel: morgon, efter pass, vecka 1"
                value={progressPhotoNote}
                onChange={(event) => setProgressPhotoNote(event.target.value)}
              />
            </label>
            <label className="photo-input">
              <span>Lägg till bild</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleProgressPhotoChange}
              />
            </label>
          </div>

          {progressPhotos.length > 0 && (
            <>
              <div className="comparison-controls">
                <label className="field">
                  <span>Före</span>
                  <select
                    value={beforePhoto ? String(beforePhoto.id) : ''}
                    onChange={(event) => setBeforePhotoId(event.target.value)}
                  >
                    {progressPhotos.map((photo) => (
                      <option value={photo.id} key={photo.id}>
                        {formatFullDate(photo.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Efter</span>
                  <select
                    value={afterPhoto ? String(afterPhoto.id) : ''}
                    onChange={(event) => setAfterPhotoId(event.target.value)}
                  >
                    {progressPhotos.map((photo) => (
                      <option value={photo.id} key={photo.id}>
                        {formatFullDate(photo.createdAt)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="before-after">
                {[beforePhoto, afterPhoto].filter(Boolean).map((photo, index) => (
                  <figure key={`${photo.id}-${index}`}>
                    <img src={photo.image} alt={index === 0 ? 'Förebild' : 'Efterbild'} />
                    <figcaption>
                      {index === 0 ? 'Före' : 'Efter'} · {formatFullDate(photo.createdAt)}
                    </figcaption>
                  </figure>
                ))}
              </div>

              <div className="photo-timeline">
                {progressPhotos.map((photo) => (
                  <article key={photo.id}>
                    <img src={photo.image} alt="Progressbild" />
                    <div>
                      <strong>{formatFullDate(photo.createdAt)}</strong>
                      <span>{photo.note || 'Ingen anteckning'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="panel settings-panel" id="installningar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inställningar</p>
              <h2>Dagliga påminnelser</h2>
            </div>
          </div>

          <div className="reminder-master">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={reminderSettings.enabled}
                onChange={(event) =>
                  updateReminderSetting('enabled', event.target.checked)
                }
              />
              <span>Aktivera påminnelser</span>
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={requestNotificationPermission}
            >
              Tillåt notiser
            </button>
          </div>
          {reminderStatus && <p className="analysis-status">{reminderStatus}</p>}

          <div className="reminder-list">
            {[
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
            ].map((reminder) => (
              <div className="reminder-row" key={reminder.enabledKey}>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={reminderSettings[reminder.enabledKey]}
                    onChange={(event) =>
                      updateReminderSetting(
                        reminder.enabledKey,
                        event.target.checked,
                      )
                    }
                  />
                  <span>{reminder.label}</span>
                </label>
                <input
                  type="time"
                  value={reminderSettings[reminder.timeKey]}
                  onChange={(event) =>
                    updateReminderSetting(reminder.timeKey, event.target.value)
                  }
                />
              </div>
            ))}
          </div>
          <p className="settings-note">
            Notiser fungerar när webbläsaren tillåter det och appen kan köras i
            bakgrunden. Allt sparas lokalt i den här webbläsaren.
          </p>
        </article>

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
          <div className="weekly-report">
            <button type="button" onClick={createWeeklyReport}>
              Skapa veckorapport
            </button>
            {weeklyReportStatus && (
              <p className="analysis-status">{weeklyReportStatus}</p>
            )}
            {weeklyReport && (
              <div className="report-card">
                {weeklyReport.split('\n').map((line, index) => (
                  <p
                    className={line.startsWith('###') ? 'report-heading' : ''}
                    key={`${line}-${index}`}
                  >
                    {line.replace('### ', '')}
                  </p>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <nav className="bottom-nav" aria-label="Huvudnavigation">
        <a href="#hem" aria-label="Gå till översikt">
          <span>⌂</span>
          <strong>Hem</strong>
        </a>
        <a href="#checkin" aria-label="Gå till dagens check-in">
          <span>✓</span>
          <strong>Check-in</strong>
        </a>
        <a href="#vikt" aria-label="Gå till viktloggen">
          <span>↗</span>
          <strong>Vikt</strong>
        </a>
        <a href="#mat" aria-label="Gå till matchecklistan">
          <span>＋</span>
          <strong>Mat</strong>
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
