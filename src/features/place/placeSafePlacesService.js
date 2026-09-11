import { supabase } from '../../services/supabaseClient.js'

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

export async function loadSafePlaces() {
  const { userId, error: sessionError } = await getSessionUserId()
  if (sessionError) return { data: [], error: sessionError }
  if (!userId) return unavailable()

  const { familyIds, error: membershipError } = await getFamilyIds(userId)
  if (membershipError) return { data: [], error: membershipError }
  if (familyIds.length === 0) return { data: [], error: null }

  const { data, error } = await supabase
    .from('place_safe_places')
    .select('id,family_id,created_by,name,latitude,longitude,radius_meters,created_at,updated_at')
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
    .select('id,family_id,created_by,name,latitude,longitude,radius_meters,created_at,updated_at')
    .single()

  return { data: data || null, error: error || null }
}

export async function deleteSafePlace(id) {
  if (!supabase || !id) return { error: new Error('Platsen kunde inte raderas.') }

  const { error } = await supabase
    .from('place_safe_places')
    .delete()
    .eq('id', id)

  return { error: error || null }
}
