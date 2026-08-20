import { parseWeightValue } from './healthCalculations.js'
import { normalizeDietaryPreferences } from './nutrition/dietaryPreferences.js'

export const profileSchemaVersion = 2

export const profileActivityLevels = ['low', 'light', 'moderate', 'high']
export const profileWeightDirections = ['loss', 'gain', 'maintain', 'missing']
export const profileProvenanceKinds = ['user_entered', 'derived', 'ai_estimated', 'missing']

const activityLabels = {
  high: 'Hög',
  light: 'Lätt',
  low: 'Låg',
  moderate: 'Medel',
}

const weightDirectionLabels = {
  gain: 'Gå upp i vikt',
  loss: 'Gå ner i vikt',
  maintain: 'Hålla vikten',
  missing: 'Mål saknas',
}

const legacyGoalByDirection = {
  gain: 'bygga muskler',
  loss: 'gå ner i vikt',
  maintain: 'hålla vikten',
  missing: '',
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value, maxLength = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function normalizeText(value) {
  return cleanText(value).toLocaleLowerCase('sv-SE')
}

function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeActivityLevel(value) {
  const text = normalizeText(value)

  if (profileActivityLevels.includes(text)) return text
  if (/mycket|hög|hog|aktiv|gym|sport|trän|tran|5/.test(text)) return 'high'
  if (/lätt|latt|promenad|vardags|2/.test(text)) return 'light'
  if (/låg|lag|stillasittande|lite|1/.test(text)) return 'low'
  if (/medel|måttlig|mattlig|normal|3|4/.test(text)) return 'moderate'

  return ''
}

export function normalizeWeightDirection(value, profile = {}) {
  const text = [
    value,
    profile.weightGoal,
    profile.goalDirection,
    profile.goal,
    profile.target,
  ].join(' ').toLocaleLowerCase('sv-SE')

  if (/gå ner|ga ner|ned|minsk|loss|deff/.test(text)) return 'loss'
  if (/gå upp|ga upp|bygg|muskel|gain|bulk/.test(text)) return 'gain'
  if (/håll|hall|behåll|behall|maintain|stabil|balans/.test(text)) return 'maintain'

  const start = parseWeightValue(profile.startWeight)
  const goal = parseWeightValue(profile.goalWeight)

  if (start !== null && goal !== null) {
    if (goal < start - 0.5) return 'loss'
    if (goal > start + 0.5) return 'gain'
    return 'maintain'
  }

  return 'missing'
}

export function normalizeHeightCm(value) {
  const parsed = parseNumber(value)

  if (!Number.isFinite(parsed)) return null

  const cm = parsed > 3 ? parsed : parsed * 100

  if (cm < 90 || cm > 250) return null

  return Math.round(cm)
}

function normalizeOptionalWeight(value) {
  const parsed = parseWeightValue(value)

  return parsed === null || parsed < 25 || parsed > 350
    ? null
    : Number(parsed.toFixed(1))
}

function provenanceFor(value, explicit) {
  if (profileProvenanceKinds.includes(explicit)) return explicit
  return value === null || value === '' || value === undefined ? 'missing' : 'user_entered'
}

export function normalizeProfile(rawProfile = {}, options = {}) {
  const source = isObject(rawProfile) ? rawProfile : {}
  const displayName = cleanText(source.displayName || source.name, 80)
  const height = normalizeHeightCm(source.heightCm ?? source.height)
  const startWeight = normalizeOptionalWeight(source.startWeight)
  const goalWeight = normalizeOptionalWeight(source.goalWeight ?? source.targetWeight)
  const activityLevel = normalizeActivityLevel(source.activityLevel || source.activity)
  const weightDirection = normalizeWeightDirection(source.weightDirection, {
    ...source,
    goalWeight,
    startWeight,
  })
  const dietaryPreferences = normalizeDietaryPreferences(source.dietaryPreferences || {
    avoidedFoods: source.avoidances || source.avoidedFoods,
    dietType: source.dietaryPattern || source.dietType,
    preferredFoods: source.preferredFoods,
    preferences: source.preferences,
  })
  const units = isObject(source.units) ? source.units : {}
  const now = options.now || new Date().toISOString()
  const createdAt = typeof source.createdAt === 'string' ? source.createdAt : now
  const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : createdAt
  const provenance = isObject(source.provenance) ? source.provenance : {}
  const normalized = {
    activityLevel,
    activityLevelLabel: activityLevel ? activityLabels[activityLevel] : '',
    createdAt,
    dietaryPreferences,
    displayName,
    goal: legacyGoalByDirection[weightDirection] || cleanText(source.goal, 80),
    goalWeight: goalWeight === null ? '' : String(goalWeight).replace('.', ','),
    height: height === null ? '' : String(height),
    heightCm: height,
    name: displayName,
    onboardingCompleted: source.onboardingCompleted === true || options.markCompleted === true,
    personalization: isObject(source.personalization) ? source.personalization : {},
    provenance: {
      activityLevel: provenanceFor(activityLevel, provenance.activityLevel),
      dietaryPreferences: provenanceFor(
        dietaryPreferences.dietType !== 'omnivore' ||
          dietaryPreferences.avoidedFoods.length ||
          dietaryPreferences.preferredFoods.length ||
          Object.values(dietaryPreferences.preferences || {}).some(Boolean)
          ? 'set'
          : '',
        provenance.dietaryPreferences,
      ),
      displayName: provenanceFor(displayName, provenance.displayName || provenance.name),
      goalWeight: provenanceFor(goalWeight, provenance.goalWeight),
      height: provenanceFor(height, provenance.height),
      startWeight: provenanceFor(startWeight, provenance.startWeight),
      weightDirection: provenanceFor(weightDirection === 'missing' ? '' : weightDirection, provenance.weightDirection),
    },
    schemaVersion: profileSchemaVersion,
    startWeight: startWeight === null ? '' : String(startWeight).replace('.', ','),
    units: {
      height: units.height === 'in' ? 'in' : 'cm',
      weight: units.weight === 'lb' ? 'lb' : 'kg',
    },
    updatedAt,
    weightDirection,
    weightDirectionLabel: weightDirectionLabels[weightDirection],
  }

  return normalized
}

export function createProfileForm(profile = {}) {
  const normalized = normalizeProfile(profile)

  return {
    activityLevel: normalized.activityLevel || 'moderate',
    avoidances: normalized.dietaryPreferences.avoidedFoods.join(', '),
    dietaryPattern: normalized.dietaryPreferences.dietType || 'omnivore',
    displayName: normalized.displayName,
    goalWeight: normalized.goalWeight,
    height: normalized.height,
    name: normalized.name,
    startWeight: normalized.startWeight,
    weightDirection: normalized.weightDirection === 'missing' ? 'loss' : normalized.weightDirection,
  }
}

export function validateProfileDraft(draft = {}) {
  const errors = {}
  const heightText = cleanText(draft.height)
  const startWeightText = cleanText(draft.startWeight)
  const goalWeightText = cleanText(draft.goalWeight)

  if (heightText && normalizeHeightCm(heightText) === null) {
    errors.height = 'Längd behöver anges i ett rimligt cm-värde.'
  }

  if (startWeightText && normalizeOptionalWeight(startWeightText) === null) {
    errors.startWeight = 'Startvikt behöver vara ett rimligt kg-värde.'
  }

  if (goalWeightText && normalizeOptionalWeight(goalWeightText) === null) {
    errors.goalWeight = 'Målvikt behöver vara ett rimligt kg-värde.'
  }

  if (draft.activityLevel && !normalizeActivityLevel(draft.activityLevel)) {
    errors.activityLevel = 'Välj en giltig aktivitetsnivå.'
  }

  return errors
}

export function profileDraftToProfile(draft = {}, options = {}) {
  const errors = validateProfileDraft(draft)

  if (Object.keys(errors).length) {
    return { errors, profile: null }
  }

  return {
    errors: {},
    profile: normalizeProfile({
      ...draft,
      dietaryPreferences: {
        avoidedFoods: draft.avoidances,
        dietType: draft.dietaryPattern,
      },
    }, {
      markCompleted: true,
      now: options.now,
    }),
  }
}

export function hasUsableProfile(profile = {}) {
  if (!isObject(profile)) return false
  const normalized = normalizeProfile(profile)

  return normalized.onboardingCompleted ||
    Boolean(normalized.displayName || normalized.heightCm || normalized.startWeight || normalized.goalWeight || normalized.activityLevel)
}

export function getProfileCompleteness(profile = {}) {
  const normalized = normalizeProfile(profile)
  const missing = []
  const completed = []

  if (normalized.displayName) completed.push('Grundprofil')
  else missing.push({ id: 'name', label: 'Namn saknas', action: 'Lägg till namn för mer personlig ton.' })

  if (normalized.heightCm) completed.push('Längd')
  else missing.push({ id: 'height', label: 'Längd saknas', action: 'Lägg till längd för bättre kroppsscanningsuppskattningar.' })

  if (normalized.weightDirection !== 'missing' || normalized.goalWeight) completed.push('Viktmål')
  else missing.push({ id: 'goal', label: 'Mål saknas', action: 'Lägg till ett mål för mer personliga råd.' })

  if (normalized.activityLevel) completed.push('Aktivitet')
  else missing.push({ id: 'activity', label: 'Aktivitetsnivå saknas', action: 'Lägg till aktivitetsnivå för bättre målrekommendationer.' })

  if (normalized.provenance.dietaryPreferences !== 'missing') completed.push('Matpreferenser')
  else missing.push({ id: 'dietaryPreferences', label: 'Matpreferenser saknas', action: 'Lägg till matpreferenser om coachen ska ta hänsyn till dem.' })

  return {
    completed,
    hasBasics: Boolean(normalized.displayName || normalized.weightDirection !== 'missing' || normalized.activityLevel),
    missing,
    nextBestAction: missing[0]?.action || 'Profilen har tillräckligt underlag för personlig anpassning.',
    status: missing.length === 0 ? 'complete' : completed.length ? 'partial' : 'empty',
  }
}

export function buildCompactProfileContext(profile = {}) {
  const normalized = normalizeProfile(profile)

  return {
    activityLevel: normalized.activityLevel,
    activityLevelLabel: normalized.activityLevelLabel,
    dietaryPreferences: normalized.dietaryPreferences,
    displayName: normalized.displayName,
    goalWeight: normalizeOptionalWeight(normalized.goalWeight),
    heightCm: normalized.heightCm,
    provenance: normalized.provenance,
    units: normalized.units,
    weightDirection: normalized.weightDirection,
  }
}
