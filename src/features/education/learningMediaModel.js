export const educationMediaSchemaVersion = 1

export const educationSectionIds = Object.freeze([
  'sign-language',
  'animal-world',
  'pregnancy-first-year',
])

export const signLanguageOptions = Object.freeze([
  { id: 'sts', labelKey: 'signLanguage.languages.sts', status: 'primary' },
  { id: 'asl', labelKey: 'signLanguage.languages.asl', status: 'future' },
  { id: 'bsl', labelKey: 'signLanguage.languages.bsl', status: 'future' },
  { id: 'international-sign', labelKey: 'signLanguage.languages.internationalSign', status: 'future-limited' },
])

export const communicationPreferences = Object.freeze([
  'text',
  'visual',
  'text-and-verified-sign',
])

const validSignLanguageIds = new Set(signLanguageOptions.map((language) => language.id))
const validCommunicationPreferences = new Set(communicationPreferences)

function asBool(value) {
  return value === true
}

function normalizeStatus(value) {
  const status = String(value || '')
  return ['verified', 'planned', 'needs-review', 'missing'].includes(status) ? status : 'missing'
}

export function createEducationalMediaItem(source = {}) {
  return {
    ageRating: String(source.ageRating || 'family'),
    aiGenerated: asBool(source.aiGenerated),
    assetId: String(source.assetId || ''),
    captionsAvailable: asBool(source.captionsAvailable),
    category: String(source.category || 'general'),
    descriptionKey: String(source.descriptionKey || ''),
    factChecked: asBool(source.factChecked),
    humanReviewed: asBool(source.humanReviewed),
    id: String(source.id || ''),
    language: String(source.language || 'sv'),
    mediaType: String(source.mediaType || 'placeholder'),
    medicalReviewed: asBool(source.medicalReviewed),
    provenance: String(source.provenance || 'planned'),
    section: educationSectionIds.includes(source.section) ? source.section : 'animal-world',
    signLanguage: validSignLanguageIds.has(source.signLanguage) ? source.signLanguage : '',
    status: normalizeStatus(source.status),
    titleKey: String(source.titleKey || ''),
    transcriptAvailable: asBool(source.transcriptAvailable),
    version: Number.isInteger(source.version) ? source.version : educationMediaSchemaVersion,
  }
}

export function canDisplayAsVerifiedMedia(item) {
  const media = createEducationalMediaItem(item)
  return Boolean(
    media.status === 'verified' &&
    media.humanReviewed &&
    media.assetId &&
    media.mediaType !== 'placeholder',
  )
}

export function getMediaDisclosureKey(item) {
  const media = createEducationalMediaItem(item)
  if (media.aiGenerated && media.section === 'pregnancy-first-year') return 'media.disclosure.aiMedical'
  if (media.aiGenerated) return 'media.disclosure.aiNature'
  if (canDisplayAsVerifiedMedia(media)) return 'media.disclosure.verified'
  if (media.status === 'needs-review') return 'media.status.needsReview'
  if (media.status === 'planned') return 'media.status.planned'
  return 'media.status.missing'
}

export function normalizeCompanionCommunicationPreferences(source = {}) {
  const selectedSignLanguage = validSignLanguageIds.has(source.selectedSignLanguage)
    ? source.selectedSignLanguage
    : 'sts'
  const communicationPreference = validCommunicationPreferences.has(source.communicationPreference)
    ? source.communicationPreference
    : 'text'

  return {
    communicationPreference,
    prefersSpeech: asBool(source.prefersSpeech),
    selectedSignLanguage,
  }
}

export function getSignLanguageCapabilityState() {
  return Object.freeze({
    humanReviewed: false,
    selectedSignLanguage: true,
    signInputRecognition: false,
    textSvar: true,
    verifiedSignAvatar: false,
    verifiedSignVideo: false,
  })
}

export const signPhraseSeeds = Object.freeze([
  { category: 'greetings', id: 'hello', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.hello' },
  { category: 'feelings', id: 'how-are-you', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.howAreYou' },
  { category: 'safety', id: 'need-help', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.needHelp' },
  { category: 'learning', id: 'do-not-understand', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.doNotUnderstand' },
  { category: 'learning', id: 'repeat', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.repeat' },
  { category: 'body', id: 'pain', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.pain' },
  { category: 'safety', id: 'call-112', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.call112' },
  { category: 'everyday', id: 'toilet', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.toilet' },
  { category: 'food', id: 'hungry', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.hungry' },
  { category: 'greetings', id: 'thanks', reviewStatus: 'needs-review', signLanguage: 'sts', textKey: 'signLanguage.phrases.thanks' },
])

export const animalWorldMediaSeeds = Object.freeze([
  createEducationalMediaItem({
    ageRating: 'family',
    category: 'family-life',
    descriptionKey: 'animalWorld.examples.gulls.description',
    factChecked: false,
    id: 'gulls-nesting',
    mediaType: 'placeholder',
    section: 'animal-world',
    status: 'planned',
    titleKey: 'animalWorld.examples.gulls.title',
  }),
  createEducationalMediaItem({
    ageRating: 'family',
    aiGenerated: true,
    category: 'unusual-animals',
    descriptionKey: 'animalWorld.examples.axolotl.description',
    factChecked: false,
    id: 'axolotl-regeneration',
    mediaType: 'placeholder',
    section: 'animal-world',
    status: 'needs-review',
    titleKey: 'animalWorld.examples.axolotl.title',
  }),
  createEducationalMediaItem({
    ageRating: 'family',
    category: 'insects',
    descriptionKey: 'animalWorld.examples.ants.description',
    factChecked: false,
    id: 'leafcutter-ants',
    mediaType: 'placeholder',
    section: 'animal-world',
    status: 'planned',
    titleKey: 'animalWorld.examples.ants.title',
  }),
])

export const pregnancyMediaSeeds = Object.freeze([
  createEducationalMediaItem({
    ageRating: 'family',
    aiGenerated: true,
    category: 'pregnancy',
    descriptionKey: 'pregnancyFirstYear.media.timeline.description',
    id: 'trimester-timeline',
    mediaType: 'placeholder',
    medicalReviewed: false,
    section: 'pregnancy-first-year',
    status: 'needs-review',
    titleKey: 'pregnancyFirstYear.media.timeline.title',
  }),
  createEducationalMediaItem({
    ageRating: 'family',
    category: 'first-year',
    descriptionKey: 'pregnancyFirstYear.media.firstYear.description',
    id: 'first-year-basics',
    mediaType: 'placeholder',
    medicalReviewed: false,
    section: 'pregnancy-first-year',
    status: 'planned',
    titleKey: 'pregnancyFirstYear.media.firstYear.title',
  }),
])
