/**
 * Interactive health avatar model.
 * Current woman = one front-facing brand PNG.
 * Not a 3D body. Not the user's private scan photos.
 */

export const AVATAR_ASSET_KIND = 'static-png-front'
export const AVATAR_FRONT_SRC = '/viktkollen-body-scan.png'

export const AVATAR_SOURCE = Object.freeze({
  kind: AVATAR_ASSET_KIND,
  src: AVATAR_FRONT_SRC,
  type: 'brand-asset',
})

export const USER_SCAN_MEDIA = Object.freeze({
  neverUsedAsAvatar: true,
  type: 'user-private',
})

export const AVATAR_VIEW_STATES = Object.freeze([
  'front',
  'front-right',
  'right',
  'back-right',
  'back',
  'back-left',
  'left',
  'front-left',
])

export const AVATAR_CARDINAL_VIEWS = Object.freeze({
  back: 'back',
  front: 'front',
  side: 'right',
})

export const BODY_AVATAR_REGIONS = Object.freeze([
  { id: 'shoulders', label: 'Axlar' },
  { id: 'arms', label: 'Armar' },
  { id: 'chest', label: 'Bröst/överkropp' },
  { id: 'waist', label: 'Midja' },
  { id: 'abdomen', label: 'Mage' },
  { id: 'hips', label: 'Höfter' },
  { id: 'glutes', label: 'Rumpa' },
  { id: 'thighs', label: 'Lår' },
  { id: 'calves', label: 'Vader' },
])

export const BODY_SIMULATION_KEYS = Object.freeze([
  'thighs',
  'glutes',
  'hips',
  'waist',
  'shoulders',
  'arms',
  'calves',
])

export const BODY_SIMULATION_RANGE = Object.freeze({ max: 100, min: -100 })

export const VISUAL_SIMULATION_DISCLAIMER =
  'Detta är en illustration och inte en förutsägelse av hur din kropp kommer att förändras.'

const VIEW_LABELS = {
  back: 'Bak',
  'back-left': 'Bak vänster',
  'back-right': 'Bak höger',
  front: 'Fram',
  'front-left': 'Fram vänster',
  'front-right': 'Fram höger',
  left: 'Vänster',
  right: 'Sida',
}

const SLIDER_COPY = {
  arms: { id: 'arms', label: 'Armar', less: 'Mindre', more: 'Större' },
  calves: { id: 'calves', label: 'Vader', less: 'Mindre', more: 'Större' },
  glutes: { id: 'glutes', label: 'Rumpa', less: 'Mindre', more: 'Större' },
  hips: { id: 'hips', label: 'Höfter', less: 'Smalare', more: 'Bredare' },
  shoulders: { id: 'shoulders', label: 'Axlar', less: 'Smalare', more: 'Bredare' },
  thighs: { id: 'thighs', label: 'Lår', less: 'Mindre', more: 'Större' },
  waist: { id: 'waist', label: 'Midja', less: 'Smalare', more: 'Bredare' },
}

export function createDefaultBodySimulationState() {
  return {
    arms: 0,
    calves: 0,
    glutes: 0,
    hips: 0,
    shoulders: 0,
    thighs: 0,
    waist: 0,
  }
}

export function getBodySimulationSliders() {
  return BODY_SIMULATION_KEYS.map((key) => SLIDER_COPY[key])
}

export function clampSimulationValue(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(
    BODY_SIMULATION_RANGE.min,
    Math.min(BODY_SIMULATION_RANGE.max, Math.round(number)),
  )
}

export function normalizeBodySimulationState(input = {}) {
  const next = createDefaultBodySimulationState()
  BODY_SIMULATION_KEYS.forEach((key) => {
    next[key] = clampSimulationValue(input[key])
  })
  return next
}

export function isBodySimulationActive(state) {
  const normalized = normalizeBodySimulationState(state)
  return BODY_SIMULATION_KEYS.some((key) => normalized[key] !== 0)
}

export function canVisuallyRenderSimulation(assetKind = AVATAR_ASSET_KIND) {
  return assetKind !== 'static-png-front'
}

export function getAvailableAvatarViews(assetKind = AVATAR_ASSET_KIND) {
  return assetKind === 'static-png-front' ? ['front'] : [...AVATAR_VIEW_STATES]
}

export function normalizeAvatarView(view) {
  if (view === 'side') return AVATAR_CARDINAL_VIEWS.side
  return AVATAR_VIEW_STATES.includes(view) ? view : 'front'
}

export function isAvatarViewRenderable(view, assetKind = AVATAR_ASSET_KIND) {
  return getAvailableAvatarViews(assetKind).includes(normalizeAvatarView(view))
}

export function getAvatarViewLabel(view) {
  return VIEW_LABELS[normalizeAvatarView(view)] || VIEW_LABELS.front
}

export function rotateAvatarView(view, steps = 1) {
  const current = normalizeAvatarView(view)
  const index = AVATAR_VIEW_STATES.indexOf(current)
  const length = AVATAR_VIEW_STATES.length
  const nextIndex = (((index + Number(steps || 0)) % length) + length) % length
  return AVATAR_VIEW_STATES[nextIndex]
}

export function getAvatarSrcForView(view, { userScanPhotos } = {}) {
  void view
  void userScanPhotos
  return AVATAR_FRONT_SRC
}

export function getAvatarViewAvailability(view, assetKind = AVATAR_ASSET_KIND) {
  const normalized = normalizeAvatarView(view)
  const renderable = isAvatarViewRenderable(normalized, assetKind)
  return {
    label: getAvatarViewLabel(normalized),
    renderable,
    src: getAvatarSrcForView(normalized),
    view: normalized,
    waitingReason: renderable
      ? ''
      : 'Endast framvy finns. Riktig 360° kräver flera renderade vinklar eller en 3D-modell.',
  }
}

export function getAvatarRendererStrategy() {
  return {
    current: 'static-png',
    heavyRenderer: 'lazy-on-fullscreen-only',
    homePreview: 'light-png',
    requiresNewEngineFor360: true,
    requiresNewEngineForMorph: true,
  }
}

export function buildBodyTimeline({ currentKg = null, goalKg = null, startKg = null } = {}) {
  function finiteOrNull(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }

  return {
    currentKg: finiteOrNull(currentKg),
    goalKg: finiteOrNull(goalKg),
    startKg: finiteOrNull(startKg),
  }
}

export function simulationMustNotTouchHealthRecords() {
  return Object.freeze({
    bodyMeasurements: false,
    healthScore: false,
    history: false,
    scanResults: false,
    weight: false,
  })
}
