import { supabase } from '../../services/supabaseClient.js'

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

export async function shareRoutePoints({ familyId, viewerUserId, points }) {
  if (!supabase) return { data: [], error: new Error('Supabase saknas.') }
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { data: [], error: new Error('Du behöver vara inloggad.') }
  const valid = (points || []).filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)))
  if (!valid.length) return { data: [], error: new Error('Det finns inga positionspunkter att dela.') }
  const rows = valid.slice(-500).map(p => ({
    family_id: familyId,
    owner_user_id: ownerUserId,
    viewer_user_id: viewerUserId,
    recorded_at: p.recordedAt || p.created_at || new Date().toISOString(),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    accuracy_meters: p.accuracyMeters == null ? null : Number(p.accuracyMeters),
  }))
  const { data, error } = await supabase.from('place_shared_route_points').insert(rows).select('id,recorded_at')
  return { data: data || [], error }
}

export async function loadRoutesSharedWithMe() {
  if (!supabase) return { data: [], error: new Error('Supabase saknas.') }
  const userId = await currentUserId()
  if (!userId) return { data: [], error: new Error('Du behöver vara inloggad.') }
  const { data, error } = await supabase
    .from('place_shared_route_points')
    .select('id,family_id,owner_user_id,viewer_user_id,recorded_at,latitude,longitude,accuracy_meters,expires_at')
    .eq('viewer_user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('recorded_at', { ascending: true })
  return { data: data || [], error }
}

export async function revokeMySharedRoutes(viewerUserId) {
  if (!supabase) return { error: new Error('Supabase saknas.') }
  const userId = await currentUserId()
  if (!userId) return { error: new Error('Du behöver vara inloggad.') }
  const query = supabase.from('place_shared_route_points').delete().eq('owner_user_id', userId)
  const { error } = viewerUserId ? await query.eq('viewer_user_id', viewerUserId) : await query
  return { error }
}
