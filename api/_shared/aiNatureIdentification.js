import { callOpenAiJson, getAiGatewayConfig } from './openaiGateway.js'

/**
 * AI Natur: isolated species-identification contract.
 * No route, UI placement or OpenAI call is enabled by this module.
 * A future endpoint must enforce authentication, image-bound consent,
 * rate limits and billing before calling the model.
 */
export const natureCategories = Object.freeze([
  'flower', 'plant', 'tree', 'mushroom', 'berry', 'fruit', 'vegetable', 'bird',
  'insect', 'animal', 'fish', 'rock', 'other',
])

const clean = (value, max = 300) => String(value ?? '')
  .replace(/[<>]/g, '')
  .replace(/https?:\/\/\S+/gi, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

export const natureIdentificationInstructions = [
  'Identify the visible wild plant, tree, flower, fungus, berry, bird, insect, animal, fish, rock, mineral or geological material from the photograph.',
  'Return one JSON object with category, swedishName, scientificName, description, facts,',
  'confidence (high, medium or low), uncertain, potentiallyPoisonous, safetyNote, reproduction and rootSpread.',
  'reproduction: a short Swedish explanation of how the identified organism reproduces, including egg-laying frequency or season only when reliably known; use an empty string when not applicable or unknown.',
  'rootSpread: for trees and rooted plants only, a short Swedish explanation of typical lateral root spread beneath the soil relative to the crown and approximate depth only when reliably supported; distinguish species-level estimates from measurements and explain that soil, moisture and age affect spread. Do not invent exact metres from a photo. For other categories return an empty string.',
  'For flower, plant, fruit and vegetable categories, also return habitat (origin and natural habitat), floweringPeriod, lifespan, care (light, water and soil), and toxicity (known risks to humans and pets, never claim safety). Keep each field concise, use empty strings if unknown or not applicable. Include identifying features in description and seed dispersal in reproduction when known. For other categories omit these extra fields.',
  'For animal, fish and insect categories only, return animalHabitat (habitat and geographic range), animalSize (typical size and weight), animalLifespan, animalDiet (food and hunting), animalPredators, animalMovement (speed and locomotion), animalBehavior (day/night activity, hibernation and migration), animalRisks (risks to humans), animalConservation (conservation status with scope if known). In reproduction include mating season, gestation or incubation, typical offspring or egg count and frequency when reliably known. Use concise Swedish phrases, omit unknown or inapplicable details, never invent numbers or infer individual age or weight from the image. Keep the complete JSON within the output budget.',
  'For fish use category fish, including sharks and rays; other aquatic animals retain their appropriate category. Return the same animal fields as for animal, with animalHabitat including freshwater, brackish or marine habitat, geographic range and typical depth when known; animalMovement includes swimming and migration; reproduction includes spawning season, egg count and frequency or live birth where applicable. Never infer exact individual size, age or weight, or declare a fish safe to eat from a photograph. Keep fields concise and omit unknown details.',
  'For insects use category insect and the animal fields, including life stages, metamorphosis, egg-laying season, typical egg count and frequency when known, habitat, diet, predators, activity, ecological role and risks such as stings or bites. For fruit and vegetables use fruit or vegetable (berries retain berry), and return habitat (origin and growing regions), floweringPeriod (growing and harvest season), lifespan (plant life cycle), care (cultivation, light, water and soil), toxicity (known risks, no edibility assurance), description and facts about characteristics. For fruit and vegetable only also return vitamins (key vitamins without quantities), benefit (cautious nutritional contribution without medical claims), and curiosity (one reliable fact). Do not estimate calories or nutrient quantities in nature identification. Keep all fields concise and omit unknown details.',
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
    ...(['flower', 'plant', 'fruit', 'vegetable'].includes(category) ? {
      habitat: clean(data.habitat, 300),
      floweringPeriod: clean(data.floweringPeriod, 200),
      lifespan: clean(data.lifespan, 200),
      care: clean(data.care, 350),
      toxicity: clean(data.toxicity, 350),
    } : {}),
    ...(['fruit', 'vegetable'].includes(category) ? {
      vitamins: clean(data.vitamins, 180),
      benefit: clean(data.benefit, 180),
      curiosity: clean(data.curiosity, 180),
    } : {}),
    ...(['animal', 'fish', 'insect'].includes(category) ? {
      animalHabitat: clean(data.animalHabitat, 300),
      animalSize: clean(data.animalSize, 200),
      animalLifespan: clean(data.animalLifespan, 200),
      animalDiet: clean(data.animalDiet, 300),
      animalPredators: clean(data.animalPredators, 200),
      animalMovement: clean(data.animalMovement, 200),
      animalBehavior: clean(data.animalBehavior, 350),
      animalRisks: clean(data.animalRisks, 300),
      animalConservation: clean(data.animalConservation, 200),
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
