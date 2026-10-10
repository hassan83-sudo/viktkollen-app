// Snabbkoll: ett lokalt bildspel över användarens valda saker.
// Ingen AI eller nätverk används.

export const fastModeTargetItems = 30
export const fastModeTargetMs = 10_000

export const slideshowSpeeds = Object.freeze({
  calm: { id: 'calm', intervalMs: 2000, label: 'Lugn', hint: '2 sek per sak' },
  fast: {
    hint: '30 saker på ca 10 sek',
    id: 'fast',
    intervalMs: Math.round(fastModeTargetMs / fastModeTargetItems),
    label: 'Snabb',
  },
  normal: { id: 'normal', intervalMs: 1000, label: 'Normal', hint: '1 sek per sak' },
})

export const slideshowSpeedOrder = Object.freeze(['fast', 'normal', 'calm'])

export function getSlideshowSpeed(id) {
  return slideshowSpeeds[id] || slideshowSpeeds.normal
}

export function isSlideshowSpeedId(id) {
  return Object.hasOwn(slideshowSpeeds, id)
}

export function estimateDurationMs(itemCount, speedId) {
  return Math.max(0, itemCount) * getSlideshowSpeed(speedId).intervalMs
}

export const slideshowStatus = Object.freeze({
  finished: 'finished',
  idle: 'idle',
  paused: 'paused',
  playing: 'playing',
})

export function createSlideshowState(itemCount = 0) {
  return { index: 0, itemCount: Math.max(0, itemCount), status: slideshowStatus.idle }
}

export function slideshowReducer(state, action) {
  switch (action.type) {
    case 'start':
    case 'restart':
      if (!state.itemCount) return { ...state, index: 0, status: slideshowStatus.idle }
      return { ...state, index: 0, status: slideshowStatus.playing }
    case 'pause':
      return state.status === slideshowStatus.playing ? { ...state, status: slideshowStatus.paused } : state
    case 'resume':
      return state.status === slideshowStatus.paused ? { ...state, status: slideshowStatus.playing } : state
    case 'tick': {
      if (state.status !== slideshowStatus.playing) return state
      const nextIndex = state.index + 1
      if (nextIndex >= state.itemCount) return { ...state, status: slideshowStatus.finished }
      return { ...state, index: nextIndex }
    }
    case 'setItemCount': {
      const itemCount = Math.max(0, action.itemCount || 0)
      return { ...createSlideshowState(itemCount) }
    }
    default:
      return state
  }
}
