import { supabase } from '../../services/supabaseClient.js'

function getCurrentPosition({ batterySaverEnabled = false } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Platsåtkomst stöds inte på den här enheten.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: !batterySaverEnabled,
      maximumAge: batterySaverEnabled ? 5 * 60 * 1000 : 30000,
      timeout: batterySaverEnabled ? 10000 : 15000,
    })
  })
}

export function requestPlaceLocationPermission() {
  return getCurrentPosition()
}

async function getSignedInUserId() {
  if (!supabase) return null

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

async function getPrimaryFamilyId(userId) {
  const { data, error } = await supabase
    .from('place_family_members')
    .select('family_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.family_id || null
}

async function disableRemoteSharing(userId, consentGrantedAt) {
  const { error } = await supabase
    .from('place_location_shares')
    .update({
      consent_granted_at: consentGrantedAt || null,
      sharing_enabled: false,
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      location_recorded_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) throw error
}

export async function syncPlaceLocationSharing(state) {
  if (!supabase) return { ok: false, reason: 'supabase-unavailable' }

  const userId = await getSignedInUserId()
  if (!userId) return { ok: false, reason: 'signed-out' }

  const consentGranted = Boolean(state?.consentGranted)
  const sharingEnabled = Boolean(state?.sharingEnabled && consentGranted)
  const batterySaverEnabled = Boolean(state?.batterySaverEnabled)
  const consentGrantedAt = consentGranted ? state?.consentGrantedAt || new Date().toISOString() : null

  if (!sharingEnabled) {
    await disableRemoteSharing(userId, consentGrantedAt)
    return { ok: true, sharingEnabled: false }
  }

  // Ask the device for location as soon as sharing is enabled. This must happen
  // before family lookup so the browser permission prompt is not skipped when
  // the account has not yet been connected to a family.
  const position = await getCurrentPosition({ batterySaverEnabled })

  const familyId = await getPrimaryFamilyId(userId)
  if (!familyId) return { ok: false, reason: 'no-family-membership' }

  const recordedAt = position.timestamp
    ? new Date(position.timestamp).toISOString()
    : new Date().toISOString()

  const { error } = await supabase
    .from('place_location_shares')
    .upsert(
      {
        user_id: userId,
        family_id: familyId,
        consent_granted_at: consentGrantedAt,
        sharing_enabled: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_meters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        location_recorded_at: recordedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) throw error

  return {
    ok: true,
    sharingEnabled: true,
    recordedAt,
  }
}
