/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inserted: [],
  envelopes: vi.fn(async () => {}),
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
        }
        return builder
      }
      if (table === 'place_safety_alerts') {
        return {
          insert(payload) {
            mocks.inserted.push(payload)
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: 'alert-1',
                      family_id: 'family-1',
                      sender_user_id: 'owner',
                      reason: payload.reason,
                      created_at: '2026-09-23T12:00:00.000Z',
                    },
                    error: null,
                  }),
                }
              },
            }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  },
}))

vi.mock('./placeFamilyE2eeService.js', () => ({
  decryptEnvelope: vi.fn(),
  writeFamilyEnvelopes: mocks.envelopes,
}))

import { sendSafetyAlert } from './placeSafetyAlertService.js'

describe('place safety alerts', () => {
  beforeEach(() => {
    mocks.inserted.length = 0
    mocks.envelopes.mockClear()
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success) => success({ coords: { latitude: 59.33, longitude: 18.06, accuracy: 6 } }),
      },
    })
  })

  it('still sends an SOS alert and encrypted family envelope', async () => {
    const result = await sendSafetyAlert('lost')
    expect(result.error).toBeNull()
    expect(mocks.inserted).toEqual([
      {
        family_id: 'family-1',
        sender_user_id: 'owner',
        reason: 'lost',
        latitude: null,
        longitude: null,
        accuracy_meters: null,
      },
    ])
    expect(mocks.envelopes).toHaveBeenCalledWith('safety_alert', 'alert-1', 'family-1', {
      latitude: 59.33,
      longitude: 18.06,
      accuracy_meters: 6,
    })
  })
})
