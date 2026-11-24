import { callOpenAiJson, getAiGatewayConfig } from './openaiGateway.js'

/**
 * AI Natur: isolated species-identification contract.
 * No route, UI placement or OpenAI call is enabled by this module.
 * A future endpoint must enforce authentication, image-bound consent,
 * rate limits and billing before calling the model.
 */
export const natureCategories = Object.freeze([
  'flower', 'plant', 'tree', 'mushroom', 'berry', 'bird',
  'insect', 'animal', 'rock', 'other',
])

const clean = (value, max = 300) => String(value ?? '')
  .replace(/[<>]/g, '')
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

export const natureIdentificationInstructions = [
  'Identify the visible wild plant, tree, flower, fungus, berry, bird, insect, animal, rock, mineral or geological material from the photograph.',
  'Return one JSON object with category, swedishName, scientificName, description, facts,',
  'confidence (high, medium or low), uncertain, potentiallyPoisonous, safetyNote, reproduction and rootSpread.',
  'reproduction: a short Swedish explanation of how the identified organism reproduces, including egg-laying frequency or season only when reliably known; use an empty string when not applicable or unknown.',
  'rootSpread: for trees and rooted plants only, a short Swedish explanation of typical lateral root spread beneath the soil relative to the crown and approximate depth only when reliably supported; distinguish species-level estimates from measurements and explain that soil, moisture and age affect spread. Do not invent exact metres from a photo. For other categories return an empty string.',
  'For flower and plant categories only, also return habitat (origin and natural habitat), floweringPeriod, lifespan, care (light, water and soil), and toxicity (known risks to humans and pets, never claim safety). Keep each field concise, use empty strings if unknown or not applicable. Include identifying features in description and seed dispersal in reproduction when known. For other categories omit these extra fields.',
  'Use Swedish for all explanatory text. For rocks and minerals use category rock, and name the likely material without claiming certainty from a photo. Do not invent an exact species when the photo is ambiguous.',
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
    reproduction: clean(data.reproduction, 500),
    rootSpread: ['tree', 'plant', 'flower'].includes(category) ? clean(data.rootSpread, 500) : '',
    ...(['flower', 'plant'].includes(category) ? {
      habitat: clean(data.habitat, 300),
      floweringPeriod: clean(data.floweringPeriod, 200),
      lifespan: clean(data.lifespan, 200),
      care: clean(data.care, 350),
      toxicity: clean(data.toxicity, 350),
    } : {}),
    facts: Array.isArray(data.facts) ? data.facts.slice(0, 4).map(v => clean(v, 200)).filter(Boolean) : [],
    confidence,
    uncertain,
    potentiallyPoisonous: data.potentiallyPoisonous === true,
    safetyNote: clean(data.safetyNote, 400) ||
      'Ät eller hantera inte okända växter, bär eller svampar utifrån enbart bildidentifiering.',
  }
}

/**
 * Provider adapter only. The caller MUST authenticate the user, verify
 * image-bound explicit consent, enforce rate limits and reserve billing
 * before invoking this function. Never expose this function as an API route.
 */
export async function identifyNatureImage({ imageBytes, mimeType, userId, usageRepository } = {}) {
  const supported = new Set(['image/jpeg', 'image/png', 'image/webp'])
  if (!supported.has(mimeType) || !Buffer.isBuffer(imageBytes) || !imageBytes.length ||
      imageBytes.length > 8 * 1024 * 1024) {
    return { ok: false, code: 'invalidImage' }
  }
  const config = getAiGatewayConfig('photo')
  const result = await callOpenAiJson({
    feature: 'ai.nature.identification',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: natureIdentificationInstructions },
        { type: 'input_image', detail: 'high',
          image_url: `data:${mimeType};base64,${imageBytes.toString('base64')}` },
      ],
    }],
    maxOutputTokens: 900,
    model: config.model,
    timeoutMs: config.timeoutMs,
    type: 'photo',
    userId,
    usageRepository,
  })
  if (!result.ok) return { ok: false, code: result.error?.code || 'providerUnavailable' }
  return { ok: true, identification: normalizeNatureIdentification(result.value) }
}
