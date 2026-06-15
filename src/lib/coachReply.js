function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('sv-SE')
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

function parseWeight(value) {
  const parsedValue = Number(
    String(value ?? '')
      .replace(',', '.')
      .replace(' kg', ''),
  )

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function formatWeight(value) {
  return `${value.toLocaleString('sv-SE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} kg`
}

function getPersonalContext({
  checkIn = {},
  currentWeight,
  foods = [],
  profile = {},
}) {
  const weight = parseWeight(currentWeight)
  const startWeight = parseWeight(profile.startWeight)
  const goalWeight = parseWeight(profile.goalWeight)
  const steps = Number(checkIn.steps)
  const energy = Number(checkIn.energy)
  const completedFoods = foods.filter((item) => item?.done).length

  return {
    completedFoods,
    energy: Number.isFinite(energy) ? energy : null,
    foodTotal: foods.length,
    goal: profile.goal || 'hållbara vanor',
    goalWeight,
    mood: String(checkIn.mood || '').trim(),
    name: String(profile.name || '').trim(),
    startWeight,
    steps: Number.isFinite(steps) ? steps : null,
    weight,
    workout: Boolean(checkIn.workout),
  }
}

function makeStepsReply(context) {
  if (context.steps === null) {
    return 'Jag hittar inga registrerade steg för i dag ännu.'
  }

  const steps = context.steps.toLocaleString('sv-SE')

  if (context.energy !== null && context.energy <= 3) {
    return `Du har ${steps} steg i dag och energin är ${context.energy}/10. Prioritera återhämtning; en kort lugn promenad räcker om den känns bra.`
  }

  if (context.steps < 5000) {
    return `Du har ${steps} steg i dag. Ett enkelt nästa steg är 10–15 minuters promenad, gärna uppdelat i två korta rundor.`
  }

  if (context.steps < 8000) {
    return `Du har ${steps} steg i dag. Du är redan på god väg; en kort promenad senare kan runda av dagen.`
  }

  return `Du har ${steps} steg i dag. Det är en aktiv dag, så du behöver inte jaga fler steg bara för siffrans skull.`
}

function makeEnergyReply(context) {
  if (context.energy === null) {
    return 'Jag hittar ingen registrerad energinivå för i dag ännu.'
  }

  if (context.energy <= 3) {
    return `Din energi är ${context.energy}/10. Gör dagen enklare: välj en lätt måltid, drick vatten och prioritera återhämtning framför ett hårt pass.`
  }

  if (context.energy <= 6) {
    return `Din energi är ${context.energy}/10. Håll planen enkel: en vanlig måltid och lätt rörelse är en rimlig nivå i dag.`
  }

  return `Din energi är ${context.energy}/10. Om kroppen känns bra passar det fint med ett planerat pass eller en rask promenad.`
}

function makeWeightProgressReply(context) {
  if (context.weight === null) {
    return 'Jag hittar ingen aktuell vikt i loggen ännu.'
  }

  const parts = [`Din senaste vikt är ${formatWeight(context.weight)}.`]

  if (
    context.goal === 'gå ner i vikt' &&
    context.goalWeight !== null
  ) {
    const remaining = Number((context.weight - context.goalWeight).toFixed(1))
    parts.push(
      remaining > 0
        ? `Det är ${formatWeight(remaining)} kvar till ditt registrerade mål.`
        : 'Du är vid eller under ditt registrerade målvärde.',
    )
  }

  if (context.startWeight !== null) {
    const change = Number((context.weight - context.startWeight).toFixed(1))

    if (change !== 0) {
      parts.push(
        `${change < 0 ? 'Ned' : 'Upp'} ${formatWeight(Math.abs(change))} sedan start.`,
      )
    }
  }

  return parts.join(' ')
}

function makeTodayPlanReply(context) {
  const actions = []

  if (context.energy !== null && context.energy <= 3) {
    actions.push('håll rörelsen lugn och prioritera återhämtning')
  } else if (context.steps !== null && context.steps < 5000) {
    actions.push('ta en kort promenad på 10–15 minuter')
  } else {
    actions.push('behåll dagens rörelse på en bekväm nivå')
  }

  if (
    context.foodTotal > 0 &&
    context.completedFoods < Math.min(3, context.foodTotal)
  ) {
    actions.push('lägg till protein eller grönsaker i nästa måltid')
  } else {
    actions.push('fortsätt med en vanlig, mättande måltid')
  }

  if (context.goal === 'bygga muskler') {
    actions.push('ge plats åt protein och återhämtning')
  } else if (context.goal === 'gå ner i vikt') {
    actions.push('håll portionerna normala utan hård kompensation')
  } else {
    actions.push('fokusera på en jämn och upprepbar rutin')
  }

  return `Dagens enkla plan:\n• ${actions.join('\n• ')}`
}

function makeTrainingReply(context) {
  if (context.energy !== null && context.energy <= 3) {
    return `Med energi ${context.energy}/10 skulle jag välja återhämtning eller en lugn promenad i dag, inte ett hårt pass.`
  }

  if (context.workout) {
    return `Du har markerat träning eller medveten rörelse som genomförd. Låt resten av dagen handla om mat, vätska och återhämtning.`
  }

  if (context.energy !== null && context.energy >= 7) {
    return `Med energi ${context.energy}/10 passar ett planerat pass bra om kroppen känns normal. Håll det enkelt och avsluta med känslan att du kunde gjort lite till.`
  }

  return 'Ett kort, lätt pass eller en promenad är en rimlig nivå i dag. Anpassa efter hur kroppen känns och avbryt om något gör ont.'
}

export function makePersonalCoachReply({
  checkIn,
  currentWeight,
  foods,
  message,
  profile,
}) {
  const text = normalizeText(message)
  const context = getPersonalContext({
    checkIn,
    currentWeight,
    foods,
    profile,
  })

  if (
    includesAny(text, [
      'hur många steg',
      'mina steg',
      'steg idag',
      'steg i dag',
      'har jag gått',
    ])
  ) {
    return makeStepsReply(context)
  }

  if (
    includesAny(text, [
      'min energi',
      'energi idag',
      'energi i dag',
      'orkar inte',
      'är trött',
      'känner mig trött',
    ])
  ) {
    return makeEnergyReply(context)
  }

  if (
    includesAny(text, [
      'vad väger jag',
      'hur mycket väger jag',
      'min vikt nu',
      'hur går det med vikten',
      'hur långt har jag kommit',
      'mot mitt mål',
      'till målvikt',
      'min målvikt',
    ])
  ) {
    return makeWeightProgressReply(context)
  }

  if (
    includesAny(text, [
      'vad ska jag göra idag',
      'vad ska jag göra i dag',
      'dagens plan',
      'dagens fokus',
      'vad bör jag fokusera på',
      'hur går det idag',
      'hur går det i dag',
    ])
  ) {
    return makeTodayPlanReply(context)
  }

  if (
    includesAny(text, [
      'ska jag träna',
      'träna idag',
      'träna i dag',
      'vilket pass',
      'promenad eller träning',
    ])
  ) {
    return makeTrainingReply(context)
  }

  if (includesAny(text, ['mitt humör', 'hur mår jag', 'check-in'])) {
    const mood = context.mood || 'inte registrerat'
    const energy =
      context.energy === null ? 'inte registrerad' : `${context.energy}/10`
    const steps =
      context.steps === null
        ? 'inte registrerade'
        : context.steps.toLocaleString('sv-SE')

    return `Dagens check-in: humör ${mood}, energi ${energy} och ${steps} steg.`
  }

  return ''
}
