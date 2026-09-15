import { supabase } from '../../services/supabaseClient.js'

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id || null
}

export async function loadActiveTripShares() {
  if (!supabase) return { data: [], userId: null, error: new Error('Supabase saknas.') }
  const userId = await currentUserId()
  if (!userId) return { data: [], userId: null, error: new Error('Du behöver vara inloggad.') }
  const { data, error } = await supabase
    .from('place_trip_shares')
    .select('id,family_id,owner_user_id,viewer_user_id,started_at,ended_at')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
  return { data: data || [], userId, error }
}

export async function startTripShare({ familyId, viewerUserId }) {
  if (!supabase) return { data: null, error: new Error('Supabase saknas.') }
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { data: null, error: new Error('Du behöver vara inloggad.') }
  const { data, error } = await supabase
    .from('place_trip_shares')
    .insert({ family_id: familyId, owner_user_id: ownerUserId, viewer_user_id: viewerUserId })
    .select('id,family_id,owner_user_id,viewer_user_id,started_at,ended_at')
    .single()
  return { data, error }
}

export async function endTripShare(id) {
  if (!supabase) return { error: new Error('Supabase saknas.') }
  const { error } = await supabase
    .from('place_trip_shares')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}
