import { supabase } from '../../services/supabaseClient.js'

const allowedStatuses = new Set(['ok', 'home', 'on_way'])

function unavailable(message = 'Check-in kräver att du är inloggad.') {
  return { data: null, error: new Error(message) }
}

async function getSessionUserId() {
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

export async function loadFamilyCheckins() {
  if (!supabase) return { data: [], error: new Error('Check-in är inte ansluten.') }

  try {
    const userId = await getSessionUserId()
    if (!userId) return { data: [], error: unavailable().error }

    const { data: memberships, error: membershipError } = await supabase
      .from('place_family_members')
      .select('family_id')
      .eq('user_id', userId)

    if (membershipError) return { data: [], error: membershipError }

    const familyIds = [...new Set((memberships || []).map((row) => row.family_id).filter(Boolean))]
    if (familyIds.length === 0) return { data: [], error: null }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('place_checkins')
      .select('id,family_id,sender_user_id,status,latitude,longitude,accuracy_meters,created_at')
      .in('family_id', familyIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20)

    return { data: data || [], error: error || null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function sendFamilyCheckin(status) {
  if (!allowedStatuses.has(status)) return unavailable('Ogiltig check-in-status.')
  if (!supabase) return unavailable('Check-in är inte ansluten.')

  try {
    const userId = await getSessionUserId()
    if (!userId) return unavailable()

    const familyId = await getPrimaryFamilyId(userId)
    if (!familyId) return unavailable('Kontot är inte kopplat till någon familj ännu.')

    const { data: location } = await supabase
      .from('place_location_shares')
      .select('latitude,longitude,accuracy_meters,sharing_enabled,consent_granted_at')
      .eq('user_id', userId)
      .maybeSingle()

    const includeLocation = Boolean(
      location?.sharing_enabled &&
      location?.consent_granted_at &&
      Number.isFinite(location?.latitude) &&
      Number.isFinite(location?.longitude),
    )

    const payload = {
      family_id: familyId,
      sender_user_id: userId,
      status,
      latitude: includeLocation ? location.latitude : null,
      longitude: includeLocation ? location.longitude : null,
      accuracy_meters: includeLocation && Number.isFinite(location?.accuracy_meters) ? location.accuracy_meters : null,
    }

    const { data, error } = await supabase
      .from('place_checkins')
      .insert(payload)
      .select('id,family_id,sender_user_id,status,latitude,longitude,accuracy_meters,created_at')
      .single()

    return { data: data || null, error: error || null }
  } catch (error) {
    return { data: null, error }
  }
}

export function subscribeFamilyCheckins(onCheckin) {
  if (!supabase || typeof onCheckin !== 'function') return () => {}

  const channel = supabase
    .channel(`place-checkins-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'place_checkins' },
      (payload) => {
        if (payload?.new) onCheckin(payload.new)
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
