import { supabase } from '../../services/supabaseClient.js'

function unavailable(message = 'Platsförfrågningar kräver att du är inloggad.') {
  return { data: null, error: new Error(message) }
}

async function getSessionUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

export async function loadLocationRequests() {
  if (!supabase) return { data: [], userId: null, error: new Error('Platsförfrågningar är inte anslutna.') }

  try {
    const userId = await getSessionUserId()
    if (!userId) return { data: [], userId: null, error: unavailable().error }

    const { data, error } = await supabase
      .from('place_location_requests')
      .select('id,family_id,requester_user_id,target_user_id,status,created_at,responded_at')
      .or(`requester_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50)

    return { data: data || [], userId, error: error || null }
  } catch (error) {
    return { data: [], userId: null, error }
  }
}

export async function sendLocationRequest({ familyId, targetUserId }) {
  if (!supabase) return unavailable('Platsförfrågningar är inte anslutna.')
  if (!familyId || !targetUserId) return unavailable('Välj en familjemedlem.')

  try {
    const userId = await getSessionUserId()
    if (!userId) return unavailable()
    if (userId === targetUserId) return unavailable('Du kan inte be dig själv om plats.')

    const { data, error } = await supabase
      .from('place_location_requests')
      .insert({
        family_id: familyId,
        requester_user_id: userId,
        target_user_id: targetUserId,
      })
      .select('id,family_id,requester_user_id,target_user_id,status,created_at,responded_at')
      .single()

    return { data: data || null, error: error || null }
  } catch (error) {
    return { data: null, error }
  }
}

export async function respondToLocationRequest(requestId, response) {
  if (!supabase) return unavailable('Platsförfrågningar är inte anslutna.')
  if (!requestId) return unavailable('Förfrågan saknas.')
  if (!['accepted', 'declined'].includes(response)) return unavailable('Ogiltigt svar på platsförfrågan.')

  try {
    const { data, error } = await supabase
      .from('place_location_requests')
      .update({ status: response, responded_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id,family_id,requester_user_id,target_user_id,status,created_at,responded_at')
      .single()

    return { data: data || null, error: error || null }
  } catch (error) {
    return { data: null, error }
  }
}

export function subscribeLocationRequests(onChange) {
  if (!supabase || typeof onChange !== 'function') return () => {}

  const channel = supabase
    .channel(`place-location-requests-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'place_location_requests' },
      () => onChange(),
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
