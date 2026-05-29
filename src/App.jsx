import { useEffect, useMemo, useState } from 'react'
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

const initialChatMessages = [
  {
    id: 1,
    role: 'assistant',
    text: 'Hej! Jag kan hjälpa dig med enkla mat-, vana- och motivationsidéer utifrån din profil. Jag ger bara allmänt stöd, inte medicinsk rådgivning.',
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

const storageKeys = {
  chat: 'viktkollen.chat',
  checkIn: 'viktkollen.checkIn',
  demoMode: 'viktkollen.demoMode',
  foods: 'viktkollen.foods',
  meals: 'viktkollen.meals',
  photoMeals: 'viktkollen.photoMeals',
  profile: 'viktkollen.profile',
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

function formatDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(date))
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

function makeCoachMessage(profile, checkIn, foods, meals, weightTrend, currentWeight) {
  const completedFoods = foods.filter((item) => item.done).length
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hålla en stabil rutin'
  const goalWeight = parseWeight(profile?.goalWeight || '')
  const startWeight = parseWeight(profile?.startWeight || '')
  const distanceToGoal = Number.isFinite(goalWeight)
    ? Number((currentWeight - goalWeight).toFixed(1))
    : null
  const totalProfileChange =
    Number.isFinite(startWeight) && Number.isFinite(currentWeight)
      ? Number((currentWeight - startWeight).toFixed(1))
      : null
  const activityHint =
    profile?.activityLevel === 'Hög'
      ? 'Med din höga aktivitetsnivå är jämn energi och återhämtning extra viktiga.'
      : profile?.activityLevel === 'Låg'
        ? 'Med en lägre aktivitetsnivå räcker små, konsekventa steg långt.'
        : 'Din aktivitetsnivå är lagom för att bygga stabila vanor utan att pressa för hårt.'

  const profileHint =
    distanceToGoal !== null
      ? `${name}, ditt mål är att ${goal}. Du ligger på ${formatWeight(currentWeight)} och målet är ${formatWeight(goalWeight)}, alltså ${formatWeight(Math.abs(distanceToGoal))} ${distanceToGoal >= 0 ? 'från' : 'förbi'} målet.`
      : `${name}, ditt mål är att ${goal}. Dagens fokus är att hålla riktningen enkel och hållbar.`

  const startHint =
    totalProfileChange !== null
      ? `Sedan din angivna startvikt är förändringen ${formatWeight(totalProfileChange)}.`
      : ''

  const energyHint =
    checkIn.energy >= 7
      ? 'Energin ser stark ut, så det här är en bra dag för ett fokuserat pass eller en längre promenad.'
      : checkIn.energy >= 4
        ? 'Energin är stabil nog för en vanlig rutin. Håll träningen enkel och prioritera sömnen i kväll.'
        : 'Energin är låg, så välj ett lättare pass och låt återhämtning vara dagens vinst.'

  const nutritionHint =
    completedFoods >= 3
      ? 'Din matchecklista är nästan avklarad. Håll måltiderna enkelt konsekventa och upprepa det som fungerade.'
      : 'Det enklaste matsteget just nu är ett extra val med protein, frukt eller grönsaker innan dagen är slut.'

  const habitHint =
    checkIn.mood === 'Stressad'
      ? 'Eftersom humöret är stressat: välj ett litet vanemål, som tio lugna minuter, en promenad eller att förbereda morgondagen.'
      : `Humöret är ${checkIn.mood.toLowerCase()}, så bygg vidare med en liten handling som gör morgondagen enklare.`

  const mealHint =
    meals.length > 0
      ? `Du har registrerat ${meals.length} måltid${meals.length === 1 ? '' : 'er'} i dag, vilket ger coachen mer sammanhang.`
      : 'Lägg till en snabb måltidsnotering för att göra återkopplingen tydligare.'

  const stepsHint =
    checkIn.steps >= 9000
      ? `Stegen är starka i dag med ${checkIn.steps.toLocaleString('sv-SE')} steg.`
      : checkIn.steps >= 7000
        ? `Du är på god väg med ${checkIn.steps.toLocaleString('sv-SE')} steg.`
        : `Du har ${checkIn.steps.toLocaleString('sv-SE')} steg hittills; ett kort, lugnt pass kan räcka.`

  const trendHint =
    weightTrend < 0
      ? 'Den senaste vikttrenden går gradvis nedåt.'
      : weightTrend > 0
        ? 'Den senaste vikttrenden går lite uppåt, så fokusera på konsekvens i stället för att reagera hårt.'
        : 'Den senaste vikttrenden är jämn, vilket är användbar feedback inför nästa lilla justering.'

  return `${profileHint} ${startHint} ${activityHint} ${energyHint} ${stepsHint} ${nutritionHint} ${habitHint} ${mealHint} ${trendHint} Inga extrema upplägg behövs; sikta på en trygg, hållbar riktning.`
}

function makeChatResponse(message, profile, checkIn, foods, meals, currentWeight) {
  const text = message.toLowerCase()
  const name = profile?.name || 'du'
  const goal = profile?.goal || 'hålla en stabil rutin'
  const goalWeight = profile?.goalWeight?.trim()
  const foodScore = foods.filter((item) => item.done).length
  const mealContext =
    meals.length > 0
      ? `Du har redan loggat ${meals.length} måltid${meals.length === 1 ? '' : 'er'} i dag.`
      : 'Du har inte loggat någon måltid än i dag.'
  const activityContext =
    checkIn.steps >= 7000
      ? `Stegen ser okej ut: ${checkIn.steps.toLocaleString('sv-SE')}.`
      : `Stegen är lite låga just nu: ${checkIn.steps.toLocaleString('sv-SE')}.`
  const weightContext = goalWeight
    ? `Nuvarande vikt är ${formatWeight(currentWeight)} och målvikt är ${goalWeight} kg.`
    : `Nuvarande vikt är ${formatWeight(currentWeight)}.`
  const intro = `${name}, utifrån målet att ${goal}: ${weightContext} Tänk hållbar riktning snarare än hårda regler.`
  const safety = 'Det här är allmänt wellness-stöd, inte medicinsk rådgivning.'
  const daysMatch = text.match(/(\d+)\s*(dag|dagar)/)
  const planDays = daysMatch
    ? Math.min(Math.max(Number(daysMatch[1]), 2), 7)
    : text.includes('flera dagar') || text.includes('veckoplan') || text.includes('matschema')
      ? 3
      : 0

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

    return `${intro}

${dayTemplates
  .map(
    ([lunch, dinner, calories, protein], index) => `### Dag ${index + 1}
- Lunch: ${lunch}
- Middag: ${dinner}
- Uppskattning: ca ${calories} kcal och ${protein} g protein`,
  )
  .join('\n\n')}

### Inköpslista
- Ägg, kyckling, tonfisk, linser/bönor, tofu och keso
- Potatis, ris, pasta, wraps, havregryn och nudlar
- Frysta grönsaker, vitkål, morötter, gurka, frukt och yoghurt/kvarg

${safety}

Dagens enkla handling: välj två proteinkällor från inköpslistan.`
  }

  if (text.includes('ikväll') || text.includes('middag') || text.includes('äta')) {
    return `${intro}

- Välj en middag med protein: kyckling, lax, tofu, bönor eller ägg.
- Lägg till grönsaker och en lagom kolhydratkälla som potatis, ris eller fullkornspasta.
- Konkreta förslag: lax med potatis och broccoli, kycklingbowl med ris, eller tofuwok med nudlar.
- ${mealContext} Matchecklistan är ${foodScore}/${foods.length}, så välj gärna en punkt som hjälper dig framåt.
- ${activityContext} Anpassa mängden efter hunger och energi ${checkIn.energy}/10.

${safety}

Dagens enkla handling: välj proteinbas till middagen först.`
  }

  if (text.includes('mellanmål')) {
    return `${intro}

- Ett bra mellanmål ska vara enkelt, mättande och passa din dag.
- Förslag: kvarg eller yoghurt med bär, ägg på knäckebröd, keso med frukt, eller hummus med morötter.
- Vill du prioritera protein: välj kvarg, ägg, keso, tonfiskmacka eller bönröra.
- Med energi ${checkIn.energy}/10 kan ett jämnt mellanmål hjälpa dig undvika att bli superhungrig senare.
- Håll portionen normal och snäll; inget extremt behövs.

${safety}

Dagens enkla handling: förbered ett mellanmål som tar under fem minuter.`
  }

  if (text.includes('motivation') || text.includes('motiver')) {
    return `${intro}

- Motivation blir lättare när nästa steg är litet nog att klara.
- Välj en minsta nivå: 10 min promenad, en proteinrik måltid eller en punkt i checklistan.
- ${activityContext} Det räcker att bygga vidare lugnt i dag.
- Om humöret är ${checkIn.mood.toLowerCase()}, sänk ribban och gör något som skapar flyt.
- Se viktmålet som en kompass, inte ett dagligt betyg.

${safety}

Dagens enkla handling: gör en hälsosam sak i fem minuter.`
  }

  if (text.includes('billig') || text.includes('proteinrik') || text.includes('lunch')) {
    return `${intro}

- Billig proteinrik lunch: ägg, tonfisk, kyckling, linser, bönor, keso eller tofu.
- Konkreta alternativ: tonfisk med ris och majs, äggwrap med grönsaker, linsgryta med potatis, eller kycklingsallad med bröd.
- För ${goal}: håll proteinet tydligt och justera ris, pasta eller potatis efter hunger.
- Lägg gärna till frukt eller grönsaker så checklistan (${foodScore}/${foods.length}) rör sig framåt.
- En bra lunch ska vara upprepningsbar, inte perfekt.

${safety}

Dagens enkla handling: bestäm morgondagens lunchprotein redan nu.`
  }

  if (text.includes('vikt') || text.includes('mål')) {
    return `${intro}

- ${weightContext}
- Fokusera på trenden över tid, inte en enskild dag.
- Måltidsidé: proteinrik lunch med kyckling, tofu eller bönor, plus grönsaker och potatis eller ris.
- Med energi ${checkIn.energy}/10 och ${checkIn.steps.toLocaleString('sv-SE')} steg är en rimlig insats bättre än ett hårt upplägg.
- Undvik extrema dieter; håll vanorna genomförbara.

${safety}

Dagens enkla handling: logga nästa måltid innan du äter.`
  }

  return `${intro}

- Börja med nästa måltid: protein, grönsaker och en lagom kolhydratkälla.
- Konkreta val: yoghurt med bär, kyckling med potatis, tofu med ris, äggmacka eller bönsallad.
- ${activityContext} Anpassa rörelsen efter energi ${checkIn.energy}/10.
- Matchecklistan är ${foodScore}/${foods.length}; välj den enklaste punkten att förbättra.
- En trygg rutin slår snabba extrema lösningar.

${safety}

Dagens enkla handling: skriv ner vad din nästa måltid ska vara.`
}

function App() {
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
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState(() =>
    readStoredValue(storageKeys.chat, initialChatMessages, isStoredChatMessages),
  )

  const latestWeight = weights.at(-1)
  const startWeight = weights[0]
  const weightChange = Number((latestWeight.value - startWeight.value).toFixed(1))
  const foodScore = foods.filter((item) => item.done).length
  const safeProfileGoalWeight = formatOptionalWeight(profile?.goalWeight)
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

  const coachMessage = useMemo(
    () =>
      makeCoachMessage(
        profile,
        checkIn,
        foods,
        meals,
        weights.at(-1).value - weights.at(-2).value,
        latestWeight.value,
      ),
    [checkIn, foods, latestWeight.value, meals, profile, weights],
  )

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

  function getValidatedProfile() {
    const startWeight = formatOptionalWeight(profile?.startWeight)
    const goalWeight = formatOptionalWeight(profile?.goalWeight)

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
          chatHistory: chatMessages.slice(-8),
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
      meals,
      latestWeight.value,
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
            Tillfällig återkoppling. En senare version kan ersätta den
            regelbaserade texten med ett riktigt AI-API.
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
            <button type="submit">Skicka</button>
          </form>
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
      </nav>
    </main>
  )
}

export default App
