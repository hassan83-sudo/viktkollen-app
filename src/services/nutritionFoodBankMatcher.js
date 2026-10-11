// Matchning av AI-identifierade ingredienser mot Livsmedelsverkets matbank
// (public.nutrition_food_bank). Ren logik utan nätverk, delas av server och test.
//
// Principer:
// - Databasens värden används oförändrade (per 100 g). Inga värden hittas på.
// - En träff används bara när huvudlivsmedlet stämmer, tillagningssättet inte
//   motsäger bilden och ingen annan kandidat med andra näringsvärden är lika bra.
// - Osäker identifiering, tvetydig träff eller orimlig energitäthet ger förslag
//   i stället för automatisk träff, och AI-uppskattningen behålls som tydligt
//   märkt reserv.

// Samma normalisering som scripts/import-livsmedelsverket-food-bank.mjs använder
// för kolumnen normalized_name.
export function normalizeFoodBankName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('sv-SE')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\b(och|med|utan|lite|mycket|ca|cirka)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tillagningsord i Livsmedelsverkets namn (normaliserade, utan å/ä/ö).
export const cookingTermGroups = Object.freeze({
  baked: ['ugnsstekt', 'ugnsstekta', 'ugnsbakad', 'ugnsbakade', 'ugnsbakat', 'bakad', 'bakade', 'gratinerad', 'gratinerade', 'rostad', 'rostade'],
  boiled: ['kokt', 'kokta', 'kokad', 'kokade', 'forvallda', 'forvalld'],
  breaded: ['panerad', 'panerade', 'panerat'],
  fried: ['stekt', 'stekta', 'friterad', 'friterade', 'friterat', 'frityrstekt', 'frityrstekta', 'wokad', 'wokade'],
  grilled: ['grillad', 'grillade', 'grillat'],
  raw: ['ra', 'farsk', 'farska'],
  smoked: ['rokt', 'rokta', 'varmrokt', 'kallrokt'],
  steamed: ['angkokt', 'angkokta'],
})

// Vilka tillagningsgrupper som är förenliga med det AI:n såg.
const compatibleCooking = Object.freeze({
  baked: ['baked', 'fried', 'grilled'],
  boiled: ['boiled', 'steamed'],
  breaded: ['breaded', 'fried', 'baked'],
  fried: ['fried', 'breaded', 'baked'],
  grilled: ['grilled', 'fried', 'baked'],
  raw: ['raw'],
  smoked: ['smoked'],
  steamed: ['steamed', 'boiled'],
})

const cookingTokenToGroup = new Map(
  Object.entries(cookingTermGroups).flatMap(([group, terms]) => terms.map((term) => [term, group])),
)

// Beskrivande ord som inte avgör vilket livsmedel det är.
const softTokens = new Set(['m', 'u', 'el', 'samt', 'typ', 'fryst', 'frysta', 'konserv', 'portion', 'hel', 'hela', 'skivad', 'skivade', 'bitar', 'bit'])

export function cookingGroupsFromMethods(methods = []) {
  const aliases = {
    bake: 'baked', baked: 'baked', 'oven-baked': 'baked', roasted: 'baked',
    boil: 'boiled', boiled: 'boiled',
    breaded: 'breaded', battered: 'breaded',
    deepfried: 'fried', 'deep-fried': 'fried', fried: 'fried', 'pan-fried': 'fried', sauteed: 'fried', stirfried: 'fried',
    grill: 'grilled', grilled: 'grilled',
    raw: 'raw', fresh: 'raw',
    smoked: 'smoked',
    steamed: 'steamed',
  }
  return [...new Set((Array.isArray(methods) ? methods : [methods])
    .map((method) => aliases[String(method || '').toLowerCase().replace(/\s+/g, '')])
    .filter(Boolean))]
}

function tokensOf(normalized) {
  return normalized.split(' ').filter(Boolean)
}

function isCookingToken(token) {
  return cookingTokenToGroup.has(token)
}

// Svenska sammansättningar: "kycklingbrost" ska matcha "kyckling", "kycklingfile" ska matcha "kyckling".
export function tokensMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length < 4) return false
  return longer.startsWith(shorter) || (shorter.length >= 5 && longer.includes(shorter))
}

export function buildFoodBankQuery(component = {}) {
  const bankName = normalizeFoodBankName(component.bankName || component.name || '')
  const tokens = tokensOf(bankName)
  const foodTokens = tokens.filter((token) => !isCookingToken(token) && !softTokens.has(token))
  const cooking = new Set([
    ...cookingGroupsFromMethods(component.cookingMethods),
    ...tokens.filter(isCookingToken).map((token) => cookingTokenToGroup.get(token)),
  ])
  return {
    cooking: [...cooking],
    foodTokens,
    head: foodTokens[0] || '',
    normalized: bankName,
  }
}

// Prefix för databasens normalized_name (huvudlivsmedlet står först hos Livsmedelsverket).
export function foodBankSearchPrefixes(component = {}) {
  const heads = new Set()
  const query = buildFoodBankQuery(component)
  if (query.head) heads.add(query.head)
  const displayHead = buildFoodBankQuery({ name: component.name }).head
  if (displayHead) heads.add(displayHead)
  return [...heads]
    .map((head) => head.slice(0, Math.min(head.length, 6)))
    .filter((prefix) => prefix.length >= 3)
}

export function scoreFoodBankCandidate(query, row = {}) {
  const normalized = normalizeFoodBankName(row.normalized_name || row.name || '')
  const tokens = tokensOf(normalized)
  if (!tokens.length || !query.head) return null
  // Huvudlivsmedlet måste stå först i databasens namn.
  if (!tokensMatch(tokens[0], query.head)) return null

  const rowFood = tokens.filter((token) => !isCookingToken(token) && !softTokens.has(token))
  const matchedQuery = query.foodTokens.filter((token) => rowFood.some((rowToken) => tokensMatch(token, rowToken)))
  const coverage = query.foodTokens.length ? matchedQuery.length / query.foodTokens.length : 0
  const extras = rowFood.filter((rowToken) => !query.foodTokens.some((token) => tokensMatch(token, rowToken)))

  const rowCooking = new Set(tokens.filter(isCookingToken).map((token) => cookingTokenToGroup.get(token)))
  let cookingScore = 0
  let cookingConflict = false
  if (query.cooking.length) {
    const allowed = new Set(query.cooking.flatMap((group) => compatibleCooking[group] || [group]))
    const exact = query.cooking.some((group) => rowCooking.has(group))
    if (exact) cookingScore = 0.3
    else if ([...rowCooking].some((group) => allowed.has(group))) cookingScore = 0.1
    else if (rowCooking.size) {
      cookingScore = -0.6
      cookingConflict = true
    } else cookingScore = -0.1
  } else if (rowCooking.has('raw')) {
    // Tillagad mat på tallriken matchas inte mot råvara när tillagning är okänd.
    cookingScore = -0.25
  }

  return {
    cookingConflict,
    coverage,
    row,
    score: Number((coverage + cookingScore - Math.min(extras.length * 0.08, 0.4)).toFixed(3)),
  }
}

export function foodBankRowToFood(row = {}) {
  const per100 = {
    calories: Number(row.calories_per_100g),
    carbs: Number(row.carbs_per_100g),
    fat: Number(row.fat_per_100g),
    protein: Number(row.protein_per_100g),
  }
  if (!Object.values(per100).every((value) => Number.isFinite(value) && value >= 0)) return null
  return {
    id: `${row.source}:${row.source_food_id}`,
    name: String(row.name || ''),
    per100,
    source: String(row.source || ''),
    sourceVersion: String(row.source_version || ''),
  }
}

export const foodBankMatchThresholds = Object.freeze({
  ambiguityMargin: 0.1,
  minCoverage: 0.5,
  minScore: 0.75,
  plausibleKcalRatio: [0.4, 2.5],
  similarKcalRatio: 0.15,
})

/**
 * Väljer en säker träff i matbanken för en komponent.
 * @param {{name, bankName, cookingMethods, confidence, aiPer100?: {calories}}} component
 * @param {object[]} rows kandidater från nutrition_food_bank
 */
export function selectFoodBankMatch(component = {}, rows = []) {
  const query = buildFoodBankQuery(component)
  if (!query.head) return { food: null, reason: 'missing_name', status: 'noMatch', suggestions: [] }

  const scored = rows
    .map((row) => scoreFoodBankCandidate(query, row))
    .filter(Boolean)
    .filter((entry) => foodBankRowToFood(entry.row))
    .sort((a, b) => b.score - a.score || a.row.name.length - b.row.name.length)

  const suggestions = scored.slice(0, 3).map((entry) => foodBankRowToFood(entry.row))
  const best = scored[0]
  const reject = (status, reason) => ({ food: null, reason, status, suggestions })

  if (!best) return reject('noMatch', 'no_candidate')
  if (best.cookingConflict) return reject('needsReview', 'cooking_conflict')
  if (best.coverage < foodBankMatchThresholds.minCoverage || best.score < foodBankMatchThresholds.minScore) {
    return reject('needsReview', 'weak_match')
  }

  const bestFood = foodBankRowToFood(best.row)
  const second = scored[1]
  if (second && best.score - second.score < foodBankMatchThresholds.ambiguityMargin) {
    const secondFood = foodBankRowToFood(second.row)
    const kcalDelta = Math.abs(bestFood.per100.calories - secondFood.per100.calories) / Math.max(bestFood.per100.calories, 1)
    if (kcalDelta > foodBankMatchThresholds.similarKcalRatio) return reject('needsReview', 'ambiguous')
  }

  // Säkerhetsspärr: databasens energitäthet får inte avvika kraftigt från det
  // bilden visar (t.ex. rå filé när AI ser panerad och friterad).
  const aiKcal = Number(component.aiPer100?.calories)
  if (Number.isFinite(aiKcal) && aiKcal > 0 && bestFood.per100.calories > 0) {
    const ratio = bestFood.per100.calories / aiKcal
    const [low, high] = foodBankMatchThresholds.plausibleKcalRatio
    if (ratio < low || ratio > high) return reject('needsReview', 'implausible_energy')
  }

  // Osäker identifiering presenteras aldrig som säker databasträff.
  if (component.confidence === 'low' || component.confidence === 'insufficient') {
    return reject('needsReview', 'low_identity_confidence')
  }

  return { food: bestFood, reason: '', score: best.score, status: 'matched', suggestions }
}
