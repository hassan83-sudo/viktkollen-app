import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteEq: vi.fn(async () => ({ error: null })),
  encrypt: vi.fn(),
  envelopeUpsert: vi.fn(async () => ({ error: null })),
  metadataUpsert: vi.fn(async () => ({ error: null })),
}))

vi.mock('../../../services/supabaseClient.js', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner' } }, error: null })) },
    from: vi.fn((table) => {
      if (table === 'social_location_envelopes') {
        return {
          delete: () => ({ eq: mocks.deleteEq }),
          upsert: mocks.envelopeUpsert,
        }
      }
      if (table === 'social_locations') return { upsert: mocks.metadataUpsert }
      throw new Error(`Unexpected table: ${table}`)
    }),
  },
}))

vi.mock('../../place/placeE2eeService.js', () => ({
  decryptPlacePayload: vi.fn(),
  encryptPlacePayloads: mocks.encrypt,
  ensurePlaceE2eeIdentity: vi.fn(async () => 'owner'),
  getPlaceE2eeDeviceId: vi.fn(async () => 'device-owner'),
}))

import { decodeSocialLocationRows, enableEncryptedSocialLocation } from './socialLocationE2eeService.js'

describe('social location E2EE decoding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteEq.mockResolvedValue({ error: null })
    mocks.envelopeUpsert.mockResolvedValue({ error: null })
    mocks.metadataUpsert.mockResolvedValue({ error: null })
  })

  it('returns only approved friends with valid decrypted coordinates', async () => {
    const decrypt = vi.fn(async (_ownerId, row) => row.payload)
    const result = await decodeSocialLocationRows([
      { owner_user_id: 'friend-1', updated_at: '2026-09-15T10:00:00Z', payload: { latitude: 56.04, longitude: 12.7, accuracy_meters: 8 } },
      { owner_user_id: 'stranger', updated_at: '2026-09-15T10:00:00Z', payload: { latitude: 1, longitude: 2 } },
      { owner_user_id: 'friend-2', updated_at: '2026-09-15T10:00:00Z', payload: { latitude: 'invalid', longitude: 12.7 } },
    ], ['friend-1', 'friend-2'], decrypt)

    expect(result).toEqual([{
      user_id: 'friend-1',
      latitude: 56.04,
      longitude: 12.7,
      accuracy_meters: 8,
      updated_at: '2026-09-15T10:00:00Z',
    }])
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it('ignores an envelope that cannot be decrypted', async () => {
    const decrypt = vi.fn().mockRejectedValue(new Error('wrong device'))
    await expect(decodeSocialLocationRows([
      { owner_user_id: 'friend-1', encrypted_payload: 'ciphertext' },
    ], ['friend-1'], decrypt)).resolves.toEqual([])
  })

  it('stores coordinates only inside recipient ciphertext', async () => {
    mocks.encrypt.mockResolvedValue([{
      encrypted_payload: 'ciphertext',
      encrypted_iv: 'iv',
      recipient_device_id: 'friend-device',
      sender_device_id: 'owner-device',
    }])

    await enableEncryptedSocialLocation([{ userId: 'friend-1' }], {
      coords: { latitude: 56.04, longitude: 12.7, accuracy: 8 },
    })

    const envelopeRows = mocks.envelopeUpsert.mock.calls[0][0]
    expect(envelopeRows).toEqual([expect.objectContaining({
      encrypted_payload: 'ciphertext',
      encrypted_iv: 'iv',
      owner_user_id: 'owner',
      recipient_user_id: 'friend-1',
    })])
    expect(envelopeRows[0]).not.toHaveProperty('latitude')
    expect(envelopeRows[0]).not.toHaveProperty('longitude')
    expect(mocks.metadataUpsert).toHaveBeenCalledWith(expect.objectContaining({
      latitude: null,
      longitude: null,
      accuracy_meters: null,
    }), { onConflict: 'user_id' })
  })
})
