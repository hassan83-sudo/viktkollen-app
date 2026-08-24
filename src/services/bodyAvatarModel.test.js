import { describe, expect, it } from 'vitest'
import {
  AVATAR_FRONT_SRC,
  AVATAR_VIEW_STATES,
  USER_SCAN_MEDIA,
  canVisuallyRenderSimulation,
  createDefaultBodySimulationState,
  getAvatarSrcForView,
  getAvatarViewAvailability,
  isBodySimulationActive,
  normalizeBodySimulationState,
  rotateAvatarView,
  simulationMustNotTouchHealthRecords,
} from './bodyAvatarModel.js'
import { makeLiveContextReply } from './bodyAvatarCoachReplies.js'

describe('bodyAvatarModel', () => {
  it('defines eight view states and only renders the front PNG today', () => {
    expect(AVATAR_VIEW_STATES).toEqual([
      'front',
      'front-right',
      'right',
      'back-right',
      'back',
      'back-left',
      'left',
      'front-left',
    ])
    expect(getAvatarViewAvailability('front').renderable).toBe(true)
    expect(getAvatarViewAvailability('right').renderable).toBe(false)
    expect(getAvatarSrcForView('back', {
      userScanPhotos: { back: 'data:image/jpeg;base64,private' },
    })).toBe(AVATAR_FRONT_SRC)
    expect(USER_SCAN_MEDIA.neverUsedAsAvatar).toBe(true)
    expect(rotateAvatarView('front', 1)).toBe('front-right')
  })

  it('keeps simulation state local and does not morph the current PNG', () => {
    const simulation = normalizeBodySimulationState({ thighs: 40, waist: -25 })
    expect(simulation.thighs).toBe(40)
    expect(isBodySimulationActive(simulation)).toBe(true)
    expect(isBodySimulationActive(createDefaultBodySimulationState())).toBe(false)
    expect(canVisuallyRenderSimulation()).toBe(false)
    expect(simulationMustNotTouchHealthRecords()).toEqual({
      bodyMeasurements: false,
      healthScore: false,
      history: false,
      scanResults: false,
      weight: false,
    })
  })
})

describe('bodyAvatarCoachReplies', () => {
  it('answers weather from live data and refuses to invent missing weather', () => {
    expect(makeLiveContextReply('Behöver jag jacka idag?', {
      liveWeather: {
        city: 'Helsingborg',
        condition: 'Halvklart',
        feelsLikeC: 14,
        hasLiveWeather: true,
        temperatureC: 16,
      },
      clothingAdvice: {
        available: true,
        lines: ['En tunn jacka eller hoodie passar bra.'],
      },
    })).toContain('16°C')

    expect(makeLiveContextReply('Hur är vädret?', { liveWeather: { hasLiveWeather: false } }))
      .toMatch(/ingen väderdata/i)
  })
})
