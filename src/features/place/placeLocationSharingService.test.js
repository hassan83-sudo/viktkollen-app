/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  encrypt: vi.fn(async (recipient, payload) => ({
    encrypted_payload: `cipher:${recipient}:${payload.latitude}`,
    encrypted_iv: `iv:${recipient}`,
  })),
  ensureIdentity: vi.fn(async () => 'owner'),
  history: vi.fn(async () => ({ stored: false })),
  writes: [],
}))

vi.mock('../../services/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'owner' } } }, error: null })),
    },
    from: vi.fn((table) => {
      if (table === 'place_family_members') {
        const builder = {
          select() { return builder },
          eq() { return builder },
          order() { return builder },
          limit() { return builder },
          maybeSingle: async () => ({ data: { family_id: 'family-1' }, error: null }),
          then(resolve, reject) {
            return Promise.resolve({
              data: [
                { user_id: 'owner' },
                { user_id: 'recipient-1' },
                { user_id: 'recipient-2' },
              ],
              error: null,
            }).then(resolve, reject)
          },
        }
        return builder
      }
      if (table === 'place_e2ee_live_locations' || table === 'place_location_shares') {
        return {
          upsert: (rows, options) => {
            mocks.writes.push({ table, rows, options })
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  },
}))

vi.mock('./placeE2eeService.js', () => ({
  encryptPlacePayload: mocks.encrypt,
  ensurePlaceE2eeIdentity: mocks.ensureIdentity,
}))

vi.mock('./placeHistoryService.js', () => ({
  recordEncryptedPlaceHistoryPoint: mocks.history,
}))

import {
  configureActiveLocationSharing,
  setPlacePositionFrequency,
  stopActiveLocationSharing,
} from './placeLocationSharingService.js'

const placeDir = path.resolve('src/features/place')
const sharingSource = readFileSync(path.join(placeDir, 'placeLocationSharingService.js'), 'utf8')
const historySource = readFileSync(path.join(placeDir, 'placeHistoryService.js'), 'utf8')
const safetySource = readFileSync(path.join(placeDir, 'placeSafetyAlertService.js'), 'utf8')
const sharingState = {
  consentGranted: true,
  sharingEnabled: true,
  consentGrantedAt: '2026-09-23T12:00:00.000Z',
}
let onPosition = null

function position(latitude, longitude, accuracy = 8) {
  return { timestamp: Date.now(), coords: { latitude, longitude, accuracy } }
}

function northOf(latitude, meters) {
  return latitude + meters / 111320
}

async function flush() {
  for (let step = 0; step < 20; step += 1) await Promise.resolve()
}

async function emit(next) {
  onPosition(next)
  await flush()
}

function liveWrites() {
  return mocks.writes.filter((write) => write.table === 'place_e2ee_live_locations')
}

describe('active place sharing dedupe', () => {
  afterEach(() => {
    stopActiveLocationSharing()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    stopActiveLocationSharing()
    mocks.writes.length = 0
    mocks.encrypt.mockClear()
    mocks.history.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'))
    onPosition = null
    const watchPosition = vi.fn((success) => {
      onPosition = success
      return 4
    })
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition,
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
      },
    })
  })

  it('keeps Live at 5 seconds and the normal interval at 30 minutes', () => {
    expect(sharingSource).toContain('live:5000')
    expect(sharingSource).toContain("'30m':1800000")
    expect(sharingSource).toContain('navigator.geolocation.watchPosition')
    expect(historySource).toContain('data?.retention_minutes ?? 0')
    expect(sharingSource).not.toContain('gps.live.session')
    expect(sharingSource).not.toContain('sendSafetyAlert')
    expect(safetySource).toContain("from('place_safety_alerts').insert")
    expect(safetySource).not.toContain('placeLocationPersistence')
  })

  it('does not write repeated stationary Live observations', async () => {
    setPlacePositionFrequency('live')
    configureActiveLocationSharing(sharingState)
    await emit(position(59.3293, 18.0686))
    for (let tick = 0; tick < 5; tick += 1) {
      vi.setSystemTime(new Date(Date.now() + 5000))
      await emit(position(59.3293, 18.0686))
    }
    expect(liveWrites()).toHaveLength(1)
    expect(mocks.writes.filter((write) => write.table === 'place_location_shares')).toHaveLength(1)
    expect(mocks.history).toHaveBeenCalledTimes(1)
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(navigator.geolocation.clearWatch).not.toHaveBeenCalled()
  })

  it('does not write GPS jitter inside the accuracy radius', async () => {
    setPlacePositionFrequency('live')
    configureActiveLocationSharing(sharingState)
    await emit(position(59.3293, 18.0686, 65))
    vi.setSystemTime(new Date(Date.now() + 5000))
    await emit(position(northOf(59.3293, 30), 18.0686, 65))
    expect(liveWrites()).toHaveLength(1)
    expect(mocks.encrypt).toHaveBeenCalledTimes(2)
  })

  it('writes meaningful movement immediately and reaches every recipient', async () => {
    setPlacePositionFrequency('live')
    configureActiveLocationSharing(sharingState)
    await emit(position(59.3293, 18.0686, 8))
    vi.setSystemTime(new Date(Date.now() + 5000))
    await emit(position(northOf(59.3293, 80), 18.0686, 8))
    expect(liveWrites()).toHaveLength(2)
    const recipients = liveWrites()[1].rows.map((row) => row.recipient_user_id).sort()
    expect(recipients).toEqual(['recipient-1', 'recipient-2'])
    expect(recipients).not.toContain('owner')
    expect(liveWrites()[1].options).toEqual({ onConflict: 'owner_user_id,recipient_user_id,family_id' })
    expect(new Set(liveWrites()[1].rows.map((row) => row.encrypted_payload)).size).toBe(2)
    expect(mocks.history).toHaveBeenCalledTimes(2)
  })

  it('skips recipient fanout for a stationary tick and heartbeats without history', async () => {
    setPlacePositionFrequency('live')
    configureActiveLocationSharing(sharingState)
    await emit(position(59.3293, 18.0686, 5))
    vi.setSystemTime(new Date(Date.now() + 5000))
    await emit(position(northOf(59.3293, 10), 18.0686, 5))
    expect(liveWrites()).toHaveLength(1)
    expect(mocks.encrypt).toHaveBeenCalledTimes(2)

    vi.setSystemTime(new Date(Date.parse('2026-09-23T12:00:00.000Z') + 120000))
    await emit(position(northOf(59.3293, 10), 18.0686, 5))
    expect(liveWrites()).toHaveLength(2)
    expect(mocks.history).toHaveBeenCalledTimes(1)
    expect(liveWrites()[1].rows).toHaveLength(2)

    vi.setSystemTime(new Date(Date.now() + 5000))
    await emit(position(northOf(59.3293, 25), 18.0686, 5))
    expect(liveWrites()).toHaveLength(3)
    expect(mocks.history).toHaveBeenCalledTimes(2)
  })

  it('does not let movement shorten the normal 30-minute interval', async () => {
    setPlacePositionFrequency('30m')
    configureActiveLocationSharing(sharingState)
    await emit(position(59.3293, 18.0686, 8))
    vi.setSystemTime(new Date(Date.now() + 5000))
    await emit(position(northOf(59.3293, 200), 18.0686, 8))
    expect(liveWrites()).toHaveLength(1)
  })
})
