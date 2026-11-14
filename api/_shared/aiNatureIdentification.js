/**
 * AI Natur: isolated species-identification contract.
 * No route, UI placement or OpenAI call is enabled by this module.
 * A future endpoint must enforce authentication, image-bound consent,
 * rate limits and billing before calling the model.
 */
export const natureCategories = Object.freeze([
  'flower', 'plant', 'tree', 'mushroom', 'berry', 'bird',
  'insect', 'animal', 'other',
])

const clean = (value, max = 300) => String(value ?? '')
  .replace(/[<>]/g, '')
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

export const natureIdentificationInstructions = [
  'Identify the visible wild plant, tree, flower, fungus, berry, bird, insect or animal from the photograph.',
  'Return one JSON object with category, swedishName, scientificName, description, facts,',
  'confidence (high, medium or low), uncertain, potentiallyPoisonous and safetyNote.',
  'Use Swedish for all explanatory text. Do not invent an exact species when the photo is ambiguous.',
  'If unsure, use a broader taxon and set uncertain to true. Never declare mushrooms, berries',
  'or plants safe to eat based on a photograph. Never give definitive medical or toxicity assurances.',
].join(' ')

export function normalizeNatureIdentification(input) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const category = natureCategories.includes(data.category) ? data.category : 'other'
  const confidence = ['high', 'medium', 'low'].includes(data.confidence) ? data.confidence : 'low'
  const uncertain = data.uncertain !== false || confidence === 'low'
  return {
    category,
    swedishName: clean(data.swedishName, 100) || 'Okänd art',
    scientificName: clean(data.scientificName, 120),
    description: clean(data.description, 600),
    facts: Array.isArray(data.facts) ? data.facts.slice(0, 4).map(v => clean(v, 200)).filter(Boolean) : [],
    confidence,
    uncertain,
    potentiallyPoisonous: data.potentiallyPoisonous === true,
    safetyNote: clean(data.safetyNote, 400) ||
      'Ät eller hantera inte okända växter, bär eller svampar utifrån enbart bildidentifiering.',
  }
}
