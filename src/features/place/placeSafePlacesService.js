import { supabase } from '../../services/supabaseClient.js'
import { ensurePlacePushSubscription } from './placePushService.js'

function unavailable(message = 'Trygga platser kräver att du är inloggad.') {
  return { data: [], error: new Error(message) }
}

async function getSessionUserId() {
  if (!supabase) return { userId: null, error: new Error('Supabase är inte anslutet.') }

  const { data, error } = await supabase.auth.getSession()
  return {
    userId: data?.session?.user?.id || null,
    error: error || null,
  }
}

async function getFamilyIds(userId) {
  const { data, error } = await supabase
    .from('place_family_members')
    .select('family_id')
    .eq('user_id', userId)

  return {
    familyIds: [...new Set((data || []).map((row) => row.family_id).filter(Boolean))],
    error: error || null,
  }
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadius = 6371000
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function loadSafePlaces() {
  const { userId, error: sessionError } = await getSessionUserId()
  if (sessionError) return { data: [], error: sessionError }
  if (!userId) return unavailable()

  const { familyIds, error: membershipError } = await getFamilyIds(userId)
  if (membershipError) return { data: [], error: membershipError }
  if (familyIds.length === 0) return { data: [], error: null }

  const { data, error } = await supabase
    .from('place_safe_places')
    .select('id,family_id,created_by,name,latitude,longitude,radius_meters,notify_on_arrival,notify_on_departure,created_at,updated_at')
    .in('family_id', familyIds)
    .order('created_at', { ascending: true })

  return { data: data || [], error: error || null }
}

export async function createSafePlaceFromOwnLatestLocation(name, radiusMeters = 150) {
  const safeName = String(name || '').trim()
  if (!safeName) return { data: null, error: new Error('Skriv ett namn på platsen.') }

  const { userId, error: sessionError } = await getSessionUserId()
  if (sessionError) return { data: null, error: sessionError }
  if (!userId) return { data: null, error: new Error('Du måste vara inloggad.') }

  const { familyIds, error: membershipError } = await getFamilyIds(userId)
  if (membershipError) return { data: null, error: membershipError }
  if (familyIds.length === 0) return { data: null, error: new Error('Ingen familj är ansluten.') }

  const { data: locations, error: locationError } = await supabase
    .from('place_location_shares')
    .select('family_id,latitude,longitude,location_recorded_at')
    .eq('user_id', userId)
    .in('family_id', familyIds)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('location_recorded_at', { ascending: false })
    .limit(1)

  if (locationError) return { data: null, error: locationError }
  const latest = locations?.[0]
  if (!latest) return { data: null, error: new Error('Ingen egen delad GPS-position finns ännu.') }

  const { data, error } = await supabase
    .from('place_safe_places')
    .insert({
      family_id: latest.family_id,
      created_by: userId,
      name: safeName,
      latitude: latest.latitude,
      longitude: latest.longitude,
      radius_meters: radiusMeters,
    })
    .select('id,family_id,created_by,name,latitude,longitude,radius_meters,notify_on_arrival,notify_on_departure,created_at,updated_at')
    .single()

  return { data: data || null, error: error || null }
}

export async function updateSafePlaceNotifications(id, updates) {
  if (!supabase || !id) return { data: null, error: new Error('Platsnotisen kunde inte ändras.') }

  const patch = {}
  if (typeof updates?.notifyOnArrival === 'boolean') patch.notify_on_arrival = updates.notifyOnArrival
  if (typeof updates?.notifyOnDeparture === 'boolean') patch.notify_on_departure = updates.notifyOnDeparture
  if (Object.keys(patch).length === 0) return { data: null, error: new Error('Ingen notisinställning valdes.') }

  const wantsPush = updates?.notifyOnArrival === true || updates?.notifyOnDeparture === true
  const pushSetup = wantsPush
    ? ensurePlacePushSubscription().catch((pushError) => ({ data: null, error: pushError }))
    : null

  const { data, error } = await supabase
    .from('place_safe_places')
    .update(patch)
    .eq('id', id)
    .select('id,family_id,created_by,name,latitude,longitude,radius_meters,notify_on_arrival,notify_on_departure,created_at,updated_at')
    .single()

  const pushResult = pushSetup ? await pushSetup : null
  if (pushResult?.error) {
    console.warn('Place push setup failed:', pushResult.error?.message || pushResult.error)
  }

  return {
    data: data || null,
    error: error || null,
    pushEnabled: Boolean(pushResult?.data?.enabled),
    pushError: pushResult?.error || null,
  }
}

export function subscribeSafePlaceTransitions(safePlaces, onTransition) {
  if (!supabase || typeof onTransition !== 'function') return () => {}

  const activePlaces = (Array.isArray(safePlaces) ? safePlaces : []).filter(
    (place) => place?.notify_on_arrival || place?.notify_on_departure,
  )
  if (activePlaces.length === 0) return () => {}

  const previousPresence = new Map()
  const channel = supabase
    .channel(`place-safe-place-transitions-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'place_location_shares' },
      (payload) => {
        const location = payload?.new
        if (!location?.user_id || !location?.family_id) return
        if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return

        activePlaces
          .filter((place) => place.family_id === location.family_id)
          .forEach((place) => {
            const radius = Number(place.radius_meters)
            const inside = distanceMeters(
              Number(location.latitude),
              Number(location.longitude),
              Number(place.latitude),
              Number(place.longitude),
            ) <= (Number.isFinite(radius) ? radius : 150)
            const key = `${place.id}:${location.user_id}`
            const previous = previousPresence.get(key)
            previousPresence.set(key, inside)

            if (previous === undefined || previous === inside) return
            if (inside && place.notify_on_arrival) {
              onTransition({ type: 'arrival', place, userId: location.user_id, location })
            } else if (!inside && place.notify_on_departure) {
              onTransition({ type: 'departure', place, userId: location.user_id, location })
            }
          })
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export async function deleteSafePlace(id) {
  if (!supabase || !id) return { error: new Error('Platsen kunde inte raderas.') }

  const { error } = await supabase
    .from('place_safe_places')
    .delete()
    .eq('id', id)

  return { error: error || null }
}
