export const activityTypes = Object.freeze([
  'walk',
  'jog',
  'football',
  'hockey',
  'cycling',
  'gym',
  'other',
])

export const activityTypeLabels = Object.freeze({
  cycling: 'Cykling',
  football: 'Fotboll',
  gym: 'Gym',
  hockey: 'Hockey',
  jog: 'Jogging',
  other: 'Annan aktivitet',
  walk: 'Promenad',
})

export const activitySources = Object.freeze([
  'manual',
  'healthkit',
  'health-connect',
  'device-sensors',
  'gps',
  'unknown',
])

export const AUTO_CONFIRM_CONFIDENCE = 0.85
export const SUGGEST_CONFIDENCE = 0.45

export function createActivityDraft({
  activityType = null,
  confidence = 0,
  distanceKm = null,
  durationMinutes = null,
  source = 'unknown',
  steps = null,
} = {}) {
  const safeConfidence = Number.isFinite(Number(confidence))
    ? Math.max(0, Math.min(1, Number(confidence)))
    : 0

  return {
    activityType: activityTypes.includes(activityType) ? activityType : null,
    caloriesEstimateKcal: null,
    caloriesIsEstimate: true,
    confidence: safeConfidence,
    distanceKm: Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : null,
    durationMinutes: Number.isFinite(Number(durationMinutes)) ? Number(durationMinutes) : null,
    needsUserConfirmation: true,
    source: activitySources.includes(source) ? source : 'unknown',
    steps: Number.isFinite(Number(steps)) ? Number(steps) : null,
  }
}

export function getActivityProposal(draft) {
  const activity = createActivityDraft(draft)
  if (!activity.durationMinutes) {
    return {
      ...activity,
      canAutoAdd: false,
      prompt: '',
      status: 'insufficient',
    }
  }

  if (!activity.activityType || activity.source === 'gps' || activity.source === 'unknown') {
    return {
      ...activity,
      activityType: activity.source === 'gps' ? null : activity.activityType,
      canAutoAdd: false,
      prompt: `Det ser ut som att du varit aktiv i cirka ${activity.durationMinutes} minuter. Vad gjorde du?`,
      status: 'needs-type',
    }
  }

  if (activity.confidence >= AUTO_CONFIRM_CONFIDENCE && activity.source !== 'gps' && activity.source !== 'unknown') {
    return {
      ...activity,
      canAutoAdd: false,
      needsUserConfirmation: true,
      prompt: `Jag hittade cirka ${activity.durationMinutes} minuters aktivitet. Var detta ${activityTypeLabels[activity.activityType]}?`,
      status: 'confirm',
    }
  }

  if (activity.confidence >= SUGGEST_CONFIDENCE) {
    return {
      ...activity,
      canAutoAdd: false,
      prompt: `Det ser ut som cirka ${activity.durationMinutes} minuters aktivitet. Var detta ${activityTypeLabels[activity.activityType]}?`,
      status: 'confirm',
    }
  }

  return {
    ...activity,
    canAutoAdd: false,
    prompt: `Det ser ut som att du varit aktiv i cirka ${activity.durationMinutes} minuter. Vad gjorde du?`,
    status: 'needs-type',
  }
}

export function estimateActivityCaloriesKcal(draft, { kcalPerMinute } = {}) {
  const activity = createActivityDraft(draft)
  const rate = Number(kcalPerMinute)
  if (!activity.durationMinutes || !Number.isFinite(rate) || rate <= 0) {
    return {
      ...activity,
      caloriesEstimateKcal: null,
      disclaimer: 'Kaloriförbrukning visas bara som uppskattning när både tid och en känd omräkning finns.',
    }
  }

  return {
    ...activity,
    caloriesEstimateKcal: Math.round(activity.durationMinutes * rate),
    disclaimer: 'Kaloriförbrukning är en uppskattning, inte en medicinsk mätning.',
  }
}

export const activityIngestionStatus = Object.freeze({
  healthConnect: false,
  healthKit: false,
  nativeGps: false,
})
