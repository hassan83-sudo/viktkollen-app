import { supabase } from '../../services/supabaseClient.js'
import { loadPlaceFamilyMembers } from './placeFamilyMemberService.js'
import { decryptPlacePayload, ensurePlaceE2eeIdentity } from './placeE2eeService.js'

function getUnavailableResult() {
  return { data: [], error: new Error('Platsdelning kräver att du är inloggad.') }
}

function memberNames(members) {
  return new Map((members || []).map((member) => [member.user_id, member.display_name?.trim() || null]))
}

export async function decodeFamilyLiveRow(row, members = []) {
  if (!row?.encrypted_payload || !row?.encrypted_iv) return null
  const payload = await decryptPlacePayload(row.owner_user_id, row)
  return {
    ...row,
    user_id: row.owner_user_id,
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    accuracy_meters: payload.accuracy_meters ?? null,
    location_recorded_at: payload.location_recorded_at || row.location_recorded_at,
    display_name: memberNames(members).get(row.owner_user_id) || null,
  }
}

export async function loadFamilyLatestLocations(options = {}) {
  if (!supabase) return getUnavailableResult()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const userId = sessionData?.session?.user?.id
  if (sessionError) return { data: [], error: sessionError }
  if (!userId) return getUnavailableResult()
  try {
    await ensurePlaceE2eeIdentity()
  } catch (error) {
    return { data: [], error }
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('place_family_members')
    .select('family_id')
    .eq('user_id', userId)
  if (membershipError) return { data: [], error: membershipError }
  const familyIds = [...new Set((memberships || []).map((row) => row.family_id).filter(Boolean))]
  if (!familyIds.length) return { data: [], error: null }

  const includeMembers = options.includeMembers !== false
  const locationQuery = supabase
    .from('place_e2ee_live_locations')
    .select('owner_user_id,recipient_user_id,family_id,encrypted_payload,encrypted_iv,location_recorded_at,updated_at')
    .eq('recipient_user_id', userId)
    .in('family_id', familyIds)
    .order('location_recorded_at', { ascending: false })
  const memberPromise = includeMembers
    ? loadPlaceFamilyMembers()
    : Promise.resolve({ data: options.members || [], error: null })
  const [{ data, error }, memberResult] = await Promise.all([locationQuery, memberPromise])
  if (error) return { data: [], error }

  const decoded = []
  for (const row of data || []) {
    try {
      const location = await decodeFamilyLiveRow(row, memberResult.data)
      if (location) decoded.push(location)
    } catch (decodeError) {
      console.warn('E2EE family live decrypt failed:', decodeError?.message || decodeError)
    }
  }
  return { data: decoded, error: memberResult.error || null }
}
