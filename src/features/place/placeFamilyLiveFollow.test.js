/* @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextPlaceMapAnchor } from './placeLocationPersistence.js'
import {
  FAMILY_LIVE_FALLBACK_POLL_MS,
  FAMILY_MEMBER_REFRESH_MS,
  STATIONARY_LIVE_REALTIME_MESSAGES_PER_HOUR,
  startFamilyLiveFollow,
} from './placeFamilyLiveFollow.js'

const placeDir = path.resolve('src/features/place')
const followSource = readFileSync(path.join(placeDir, 'placeFamilyLiveFollow.js'), 'utf8')
const mapSource = readFileSync(path.join(placeDir, 'placeFamilyMapService.js'), 'utf8')
const safetySource = readFileSync(path.join(placeDir, 'placeSafetyAlertService.js'), 'utf8')
const viewSource = readFileSync(path.resolve('src/components/place/FamilyMapView.jsx'), 'utf8')

function createClient() {
  const handlers = []
  const client = {
    handlers,
    status: null,
    authHandler: null,
    removeChannel: vi.fn(),
    channel: vi.fn(() => client.channelApi),
    channelApi: {
      on(type, filter, callback) {
        handlers.push({ filter, callback })
        return client.channelApi
      },
      subscribe(callback) {
        client.status = callback
        return client.channelApi
      },
    },
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        client.authHandler = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  }
  return client
}

async function flush() {
  for (let step = 0; step < 8; step += 1) await Promise.resolve()
}

describe('family live follow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps encryption, recipient filter, and SOS unchanged', () => {
    expect(mapSource).toContain('decryptPlacePayload')
    expect(followSource).toContain('includeMembers: false')
    expect(followSource).toContain('recipient_user_id=eq.')
    expect(followSource).not.toContain('latitude:')
    expect(followSource).not.toContain('sendSafetyAlert')
    expect(safetySource).toContain("from('place_safety_alerts').insert")
    expect(safetySource).not.toContain('placeFamilyLiveFollow')
    expect(viewSource).not.toContain('setInterval(refresh,5000)')
    expect(viewSource).toContain('nextPlaceMapAnchor')
  })

  it('does not fetch members on the 5-second live cadence', async () => {
    const client = createClient()
    const loadMembers = vi.fn(async () => ({
      data: [{ user_id: 'me', family_id: 'family-1', display_name: 'Me' }],
      userId: 'me',
      error: null,
    }))
    const loadLocations = vi.fn(async () => ({ data: [], error: null }))
    const intervals = []
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, delay) => {
      intervals.push({ callback, delay })
      return intervals.length
    })
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

    const stop = startFamilyLiveFollow({
      client,
      loadMembers,
      loadLocations,
      onLocations() {},
      onMembers() {},
    })
    await flush()
    client.status('SUBSCRIBED')
    await flush()

    const fallback = intervals.find((timer) => timer.delay === FAMILY_LIVE_FALLBACK_POLL_MS)
    expect(fallback).toBeUndefined()
    expect(loadMembers).toHaveBeenCalledTimes(1)
    expect(loadLocations).toHaveBeenCalledTimes(2)
    expect(client.channel).toHaveBeenCalledTimes(1)
    stop()
  })

  it('delivers a real movement without another location read and keeps the map anchor stable when only time changes', async () => {
    const client = createClient()
    const loadLocations = vi.fn(async () => ({
      data: [{
        user_id: 'sender',
        family_id: 'family-1',
        latitude: 59.3293,
        longitude: 18.0686,
        accuracy_meters: 8,
        location_recorded_at: '2026-09-23T12:00:00.000Z',
      }],
      error: null,
    }))
    const seen = []
    const stop = startFamilyLiveFollow({
      client,
      loadMembers: async () => ({
        data: [{ user_id: 'me', family_id: 'family-1' }],
        userId: 'me',
        error: null,
      }),
      loadLocations,
      decodeRow: async (row) => ({
        user_id: row.owner_user_id,
        family_id: row.family_id,
        latitude: 59.3293 + 80 / 111320,
        longitude: 18.0686,
        accuracy_meters: 8,
        location_recorded_at: '2026-09-23T12:00:05.000Z',
      }),
      onLocations(result) { seen.push(result.data) },
      onMembers() {},
    })
    await flush()
    client.status('SUBSCRIBED')
    await flush()
    const readsBeforeMove = loadLocations.mock.calls.length
    const locationHandler = client.handlers.find((handler) => handler.filter.table === 'place_e2ee_live_locations')
    locationHandler.callback({
      eventType: 'UPDATE',
      new: {
        owner_user_id: 'sender',
        recipient_user_id: 'me',
        family_id: 'family-1',
        encrypted_payload: 'cipher',
        encrypted_iv: 'iv',
      },
    })
    await flush()
    expect(loadLocations).toHaveBeenCalledTimes(readsBeforeMove)
    const latest = seen.at(-1)[0]
    expect(latest.latitude).not.toBe(59.3293)
    const anchor = nextPlaceMapAnchor(null, 'family-1:sender', seen[0][0])
    expect(nextPlaceMapAnchor(anchor, 'family-1:sender', { ...anchor, location_recorded_at: 'later' })).toBe(anchor)
    expect(nextPlaceMapAnchor(anchor, 'family-1:sender', latest)).not.toBe(anchor)
    stop()
  })

  it('polls locations only while realtime is down, then stops when it reconnects', async () => {
    const client = createClient()
    const loadMembers = vi.fn(async () => ({
      data: [{ user_id: 'me', family_id: 'family-1' }],
      userId: 'me',
      error: null,
    }))
    const loadLocations = vi.fn(async () => ({ data: [], error: null }))
    const intervals = []
    vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, delay) => {
      intervals.push({ callback, delay })
      return intervals.length
    })
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    const stop = startFamilyLiveFollow({
      client,
      loadMembers,
      loadLocations,
      onLocations() {},
      onMembers() {},
    })
    await flush()
    client.status('CHANNEL_ERROR')
    const fallback = intervals.find((timer) => timer.delay === 5000)
    expect(fallback).toBeTruthy()
    const membersBefore = loadMembers.mock.calls.length
    const locationsBefore = loadLocations.mock.calls.length
    fallback.callback()
    await flush()
    expect(loadLocations.mock.calls.length).toBe(locationsBefore + 1)
    expect(loadMembers.mock.calls.length).toBe(membersBefore)

    client.status('SUBSCRIBED')
    await flush()
    const locationsWhenLive = loadLocations.mock.calls.length
    fallback.callback()
    fallback.callback()
    await flush()
    expect(loadLocations.mock.calls.length).toBe(locationsWhenLive)
    expect(intervals.filter((timer) => timer.delay === 5000)).toHaveLength(1)
    expect(client.channel).toHaveBeenCalledTimes(1)
    stop()
  })

  it('refreshes members when the family changes and ignores the previous family', async () => {
    const client = createClient()
    const loadMembers = vi.fn()
      .mockResolvedValueOnce({
        data: [{ user_id: 'me', family_id: 'family-1' }],
        userId: 'me',
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ user_id: 'me', family_id: 'family-2' }],
        userId: 'me',
        error: null,
      })
    const loadLocations = vi.fn(async () => ({ data: [], error: null }))
    const decodeRow = vi.fn(async () => ({ user_id: 'sender', family_id: 'family-1', latitude: 1, longitude: 2 }))
    const stop = startFamilyLiveFollow({
      client,
      loadMembers,
      loadLocations,
      decodeRow,
      onLocations() {},
      onMembers() {},
    })
    await flush()
    const membership = client.handlers.find((handler) => handler.filter.table === 'place_family_members')
    membership.callback({ eventType: 'UPDATE', new: { family_id: 'family-2' } })
    await flush()
    expect(loadMembers).toHaveBeenCalledTimes(2)
    expect(loadLocations).toHaveBeenCalledTimes(2)
    const locationHandler = client.handlers.find((handler) => handler.filter.table === 'place_e2ee_live_locations')
    locationHandler.callback({
      eventType: 'UPDATE',
      new: {
        owner_user_id: 'sender',
        recipient_user_id: 'me',
        family_id: 'family-1',
        encrypted_payload: 'cipher',
        encrypted_iv: 'iv',
      },
    })
    await flush()
    expect(decodeRow).not.toHaveBeenCalled()
    stop()
  })

  it('stops follower activity on logout', async () => {
    const client = createClient()
    const loadLocations = vi.fn(async () => ({ data: [{ user_id: 'sender' }], error: null }))
    const stopped = vi.fn()
    const stop = startFamilyLiveFollow({
      client,
      loadMembers: async () => ({
        data: [{ user_id: 'me', family_id: 'family-1' }],
        userId: 'me',
        error: null,
      }),
      loadLocations,
      onLocations() {},
      onMembers() {},
      onStopped: stopped,
    })
    await flush()
    client.status('SUBSCRIBED')
    await flush()
    client.authHandler('SIGNED_OUT', null)
    expect(stopped).toHaveBeenCalled()
    expect(client.removeChannel).toHaveBeenCalled()
    const reads = loadLocations.mock.calls.length
    client.status('CHANNEL_ERROR')
    expect(loadLocations.mock.calls.length).toBe(reads)
    stop()
  })

  it('estimates a stationary realtime hour without hot polling', () => {
    const hourMs = 60 * 60 * 1000
    const memberReads = 1 + Math.floor((hourMs - 1) / FAMILY_MEMBER_REFRESH_MS)
    const locationReads = 2
    expect(FAMILY_LIVE_FALLBACK_POLL_MS).toBe(5000)
    expect(FAMILY_MEMBER_REFRESH_MS).toBe(600000)
    expect(memberReads + locationReads).toBe(8)
    expect(STATIONARY_LIVE_REALTIME_MESSAGES_PER_HOUR).toBe(30)
    expect((memberReads + locationReads) * 5).toBe(40)
    expect(hourMs / FAMILY_LIVE_FALLBACK_POLL_MS).toBe(720)
  })
})
