function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
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
  if (!Number.isFinite(value)) {
    return ''
  }

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

function getFoodSummary(context) {
  if (context.foodTotal <= 0) {
    return 'Jag ser ingen matchecklista ännu, så börja enkelt: protein, något grönt och en lagom kolhydratkälla i nästa måltid.'
  }

  const percent = Math.round((context.completedFoods / context.foodTotal) * 100)

  if (percent >= 75) {
    return `Matchecklistan ser stark ut: ${context.completedFoods}/${context.foodTotal} punkter är klara. Fortsätt med samma bas i nästa måltid.`
  }

  if (percent >= 40) {
    return `Du har ${context.completedFoods}/${context.foodTotal} matpunkter klara. Välj en sak till, helst protein eller grönsaker, så blir dagen stabilare.`
  }

  return `Du har ${context.completedFoods}/${context.foodTotal} matpunkter klara. Gör nästa steg litet: lägg till en proteinbas eller frukt/grönsaker.`
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
    return `Du har ${steps} steg i dag. Ett enkelt nästa steg är 10-15 minuters promenad, gärna uppdelat i två korta rundor.`
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
  } else if (context.goalWeight !== null) {
    parts.push(`Din registrerade målvikt är ${formatWeight(context.goalWeight)}.`)
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
    actions.push('ta en kort promenad på 10-15 minuter')
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
    return 'Du har markerat träning eller medveten rörelse som genomförd. Låt resten av dagen handla om mat, vätska och återhämtning.'
  }

  if (context.energy !== null && context.energy >= 7) {
    return `Med energi ${context.energy}/10 passar ett planerat pass bra om kroppen känns normal. Håll det enkelt och avsluta med känslan att du kunde gjort lite till.`
  }

  return 'Ett kort, lätt pass eller en promenad är en rimlig nivå i dag. Anpassa efter hur kroppen känns och avbryt om något gör ont.'
}

function makeCheckInReply(context) {
  const mood = context.mood || 'inte registrerat'
  const energy =
    context.energy === null ? 'inte registrerad' : `${context.energy}/10`
  const steps =
    context.steps === null
      ? 'inte registrerade'
      : context.steps.toLocaleString('sv-SE')
  const workout = context.workout
    ? 'träning/rörelse är markerad'
    : 'träning/rörelse är inte markerad'

  return `Dagens check-in: humör ${mood}, energi ${energy}, ${steps} steg och ${workout}.`
}

function makeWhyReply(context) {
  const reasons = []

  if (context.energy !== null) {
    reasons.push(`energin är ${context.energy}/10`)
  }

  if (context.steps !== null) {
    reasons.push(`du har ${context.steps.toLocaleString('sv-SE')} steg i dag`)
  }

  if (context.foodTotal > 0) {
    reasons.push(`${context.completedFoods}/${context.foodTotal} matpunkter är klara`)
  }

  if (context.weight !== null) {
    reasons.push(`senaste vikten är ${formatWeight(context.weight)}`)
  }

  if (reasons.length === 0) {
    return 'För att det är ett stabilt första steg när jag saknar mer data: gör det enkelt, upprepbart och snällt mot kroppen.'
  }

  return `För att jag väger ihop din aktuella data: ${reasons.join(', ')}. Därför är ett litet, konkret nästa steg bättre än att ändra allt på en gång.`
}

function makeHowMuchReply(context) {
  if (context.goalWeight !== null && context.weight !== null) {
    const remaining = Number((context.weight - context.goalWeight).toFixed(1))

    if (remaining > 0) {
      return `Om du menar målvikt är det ${formatWeight(remaining)} kvar från din senaste vikt till målet.`
    }
  }

  if (context.steps !== null && context.steps < 8000) {
    const remainingSteps = Math.max(8000 - context.steps, 0)

    return `Om du menar steg: ungefär ${remainingSteps.toLocaleString('sv-SE')} steg till tar dig till 8 000 i dag. En kort promenad räcker ofta.`
  }

  if (context.foodTotal > 0) {
    const remainingFoods = Math.max(context.foodTotal - context.completedFoods, 0)

    return `Om du menar matchecklistan: ${remainingFoods} punkt${remainingFoods === 1 ? '' : 'er'} återstår i dag.`
  }

  return 'Lagom mycket är ett litet steg du kan upprepa: 10-15 minuter rörelse, en normal portion eller en extra protein-/grönsakskomponent.'
}

function makeSafetyReply(context) {
  const dataHint = context.energy !== null
    ? ` Med din energi på ${context.energy}/10 bör du anpassa nivån efter kroppen.`
    : ''

  return `Det låter inte automatiskt skadligt, men det beror på mängd, sammanhang och hur du mår.${dataHint} Om det gäller smärta, yrsel, extrem svält eller stark oro ska du välja ett säkrare alternativ och söka vårdråd.`
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
      'är det skadligt',
      'är de skadligt',
      'skadligt',
      'farligt',
      'dåligt för kroppen',
      'inte bra för kroppen',
    ])
  ) {
    return makeSafetyReply(context)
  }

  if (
    includesAny(text, [
      'hur mycket då',
      'hur mycket',
      'hur många då',
      'hur många',
      'hur långt',
    ])
  ) {
    return makeHowMuchReply(context)
  }

  if (
    includesAny(text, [
      'varför',
      'varför då',
      'hur kommer det sig',
    ])
  ) {
    return makeWhyReply(context)
  }

  if (
    includesAny(text, [
      'hur många steg',
      'mina steg',
      'steg idag',
      'steg i dag',
      'har jag gått',
      'gått idag',
      'gått i dag',
      'aktivitet',
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
      'check-in',
      'checkin',
      'hur mår jag',
      'mitt humör',
    ])
  ) {
    return includesAny(text, ['check-in', 'checkin', 'hur mår jag', 'mitt humör'])
      ? makeCheckInReply(context)
      : makeEnergyReply(context)
  }

  if (
    includesAny(text, [
      'vad väger jag',
      'hur mycket väger jag',
      'min vikt',
      'vikt nu',
      'hur går det med vikten',
      'hur långt har jag kommit',
      'mot mitt mål',
      'till målvikt',
      'min målvikt',
      'målvikt',
      'målet',
    ])
  ) {
    return makeWeightProgressReply(context)
  }

  if (
    includesAny(text, [
      'mat',
      'måltid',
      'äta',
      'äter',
      'mellanmål',
      'protein',
      'grönsaker',
      'matchecklista',
      'checklistan',
    ])
  ) {
    return getFoodSummary(context)
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
      'nästa steg',
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
      'träning',
      'pass',
    ])
  ) {
    return makeTrainingReply(context)
  }

  return ''
}
