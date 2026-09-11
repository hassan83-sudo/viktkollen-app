import { supabase } from '../../services/supabaseClient.js'

function getUnavailableResult() {
  return {
    data: [],
    error: new Error('Platsdelning kräver att du är inloggad.'),
  }
}

export async function loadFamilyLatestLocations() {
  if (!supabase) return getUnavailableResult()

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const userId = sessionData?.session?.user?.id

  if (sessionError) return { data: [], error: sessionError }
  if (!userId) return getUnavailableResult()

  const { data: memberships, error: membershipError } = await supabase
    .from('place_family_members')
    .select('family_id')
    .eq('user_id', userId)

  if (membershipError) return { data: [], error: membershipError }

  const familyIds = [...new Set((memberships || []).map((row) => row.family_id).filter(Boolean))]
  if (familyIds.length === 0) return { data: [], error: null }

  const { data, error } = await supabase
    .from('place_location_shares')
    .select('user_id,family_id,latitude,longitude,accuracy_meters,location_recorded_at,updated_at')
    .in('family_id', familyIds)
    .eq('sharing_enabled', true)
    .not('consent_granted_at', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('location_recorded_at', { ascending: false })

  return {
    data: data || [],
    error: error || null,
  }
}
