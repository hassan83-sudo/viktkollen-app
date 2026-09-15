import { supabase } from '../../services/supabaseClient.js'

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id || null
}

const fields='id,family_id,owner_user_id,viewer_user_id,started_at,ended_at,destination_latitude,destination_longitude,eta_minutes,deviation_alerts'

export async function loadActiveTripShares() {
  if (!supabase) return { data: [], userId: null, error: new Error('Supabase saknas.') }
  const userId = await currentUserId()
  if (!userId) return { data: [], userId: null, error: new Error('Du behöver vara inloggad.') }
  const { data, error } = await supabase.from('place_trip_shares').select(fields).is('ended_at', null).order('started_at', { ascending: false })
  return { data: data || [], userId, error }
}

export async function startTripShare({ familyId, viewerUserId, destinationLatitude=null, destinationLongitude=null, etaMinutes=null, deviationAlerts=false }) {
  if (!supabase) return { data: null, error: new Error('Supabase saknas.') }
  const ownerUserId = await currentUserId()
  if (!ownerUserId) return { data: null, error: new Error('Du behöver vara inloggad.') }
  const row={family_id:familyId,owner_user_id:ownerUserId,viewer_user_id:viewerUserId,deviation_alerts:Boolean(deviationAlerts)}
  if(Number.isFinite(Number(destinationLatitude))&&Number.isFinite(Number(destinationLongitude))){row.destination_latitude=Number(destinationLatitude);row.destination_longitude=Number(destinationLongitude)}
  if(Number.isFinite(Number(etaMinutes))&&Number(etaMinutes)>0)row.eta_minutes=Math.round(Number(etaMinutes))
  const { data, error } = await supabase.from('place_trip_shares').insert(row).select(fields).single()
  return { data, error }
}

export async function endTripShare(id) {
  if (!supabase) return { error: new Error('Supabase saknas.') }
  const { error } = await supabase.from('place_trip_shares').update({ ended_at: new Date().toISOString() }).eq('id', id)
  return { error }
}
