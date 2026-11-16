import { callOpenAiJson, getAiGatewayConfig } from './openaiGateway.js'

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
    maxOutputTokens: 650,
    model: config.model,
    timeoutMs: config.timeoutMs,
    type: 'photo',
    userId,
    usageRepository,
  })
  if (!result.ok) return { ok: false, code: result.error?.code || 'providerUnavailable' }
  return { ok: true, identification: normalizeNatureIdentification(result.value) }
}
