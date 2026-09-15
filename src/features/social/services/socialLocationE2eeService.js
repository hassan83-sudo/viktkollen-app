import { supabase } from '../../../services/supabaseClient.js'
import {
  decryptPlacePayload,
  encryptPlacePayloads,
  ensurePlaceE2eeIdentity,
  getPlaceE2eeDeviceId,
} from '../../place/placeE2eeService.js'

const envelopeFields = [
  'owner_user_id',
  'recipient_user_id',
  'recipient_device_id',
  'sender_device_id',
  'encrypted_payload',
  'encrypted_iv',
  'updated_at',
].join(',')

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const userId = data?.user?.id
  if (!userId) throw new Error('Logga in för att dela plats med vänner.')
  return userId
}

function uniqueFriendIds(friends, userId) {
  return [...new Set((friends || []).map((friend) => friend?.userId).filter((id) => id && id !== userId))]
}

export async function prepareSocialLocationEncryption() {
  return ensurePlaceE2eeIdentity()
}

export async function decodeSocialLocationRows(rows, friendIds, decrypt = decryptPlacePayload) {
  const allowed = new Set(friendIds)
  const newestByOwner = new Map()
  for (const row of rows || []) {
    if (!allowed.has(row.owner_user_id) || newestByOwner.has(row.owner_user_id)) continue
    try {
      const payload = await decrypt(row.owner_user_id, row)
      const latitude = Number(payload?.latitude)
      const longitude = Number(payload?.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
      newestByOwner.set(row.owner_user_id, {
        user_id: row.owner_user_id,
        latitude,
        longitude,
        accuracy_meters: Number.isFinite(Number(payload?.accuracy_meters)) ? Number(payload.accuracy_meters) : null,
        updated_at: payload?.updated_at || row.updated_at,
      })
    } catch {
      // Envelopes for another/old device are ignored without exposing ciphertext errors.
    }
  }
  return [...newestByOwner.values()]
}

export async function loadEncryptedFriendLocations(friends = []) {
  const userId = await requireUserId()
  await ensurePlaceE2eeIdentity()
  const deviceId = await getPlaceE2eeDeviceId()
  const friendIds = uniqueFriendIds(friends, userId)
  if (!friendIds.length) return []

  const { data, error } = await supabase
    .from('social_location_envelopes')
    .select(envelopeFields)
    .eq('recipient_user_id', userId)
    .in('recipient_device_id', [deviceId, 'legacy'])
    .in('owner_user_id', friendIds)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return decodeSocialLocationRows(data, friendIds)
}

export async function enableEncryptedSocialLocation(friends, position) {
  const userId = await requireUserId()
  await ensurePlaceE2eeIdentity()
  const friendIds = uniqueFriendIds(friends, userId)
  if (!friendIds.length) throw new Error('Lägg till en vän innan du delar din plats.')

  const updatedAt = new Date().toISOString()
  const payload = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy_meters: Number.isFinite(Number(position.coords.accuracy)) ? Number(position.coords.accuracy) : null,
    updated_at: updatedAt,
  }
  const rows = []
  for (const friendId of friendIds) {
    try {
      const encrypted = await encryptPlacePayloads(friendId, payload)
      for (const envelope of encrypted) {
        rows.push({
          owner_user_id: userId,
          recipient_user_id: friendId,
          recipient_device_id: envelope.recipient_device_id,
          sender_device_id: envelope.sender_device_id,
          encrypted_payload: envelope.encrypted_payload,
          encrypted_iv: envelope.encrypted_iv,
          updated_at: updatedAt,
        })
      }
    } catch {
      // A friend without an E2EE device key is skipped; no cleartext fallback is allowed.
    }
  }
  if (!rows.length) throw new Error('Ingen vän är redo för krypterad platsdelning ännu.')

  const removed = await supabase.from('social_location_envelopes').delete().eq('owner_user_id', userId)
  if (removed.error) throw removed.error
  const saved = await supabase.from('social_location_envelopes').upsert(rows, {
    onConflict: 'owner_user_id,recipient_user_id,recipient_device_id',
  })
  if (saved.error) throw saved.error

  const metadata = await supabase.from('social_locations').upsert({
    user_id: userId,
    enabled: true,
    latitude: null,
    longitude: null,
    accuracy_meters: null,
    updated_at: updatedAt,
  }, { onConflict: 'user_id' })
  if (metadata.error) throw metadata.error
  return { recipientCount: rows.length }
}

export async function disableEncryptedSocialLocation() {
  const userId = await requireUserId()
  const removed = await supabase.from('social_location_envelopes').delete().eq('owner_user_id', userId)
  if (removed.error) throw removed.error
  const { error } = await supabase.from('social_locations').upsert({
    user_id: userId,
    enabled: false,
    latitude: null,
    longitude: null,
    accuracy_meters: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}
