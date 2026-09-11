import { supabase } from '../../services/supabaseClient.js'

function unavailable(message = 'Familjemedlemmar kräver att du är inloggad.') {
  return { data: [], userId: null, error: new Error(message) }
}

export async function loadPlaceFamilyMembers() {
  if (!supabase) return unavailable('Supabase är inte anslutet.')

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: [], userId: null, error: sessionError }

  const userId = sessionData?.session?.user?.id || null
  if (!userId) return unavailable()

  const { data: ownMemberships, error: ownError } = await supabase
    .from('place_family_members')
    .select('family_id')
    .eq('user_id', userId)

  if (ownError) return { data: [], userId, error: ownError }

  const familyIds = [...new Set((ownMemberships || []).map((row) => row.family_id).filter(Boolean))]
  if (familyIds.length === 0) return { data: [], userId, error: null }

  const { data, error } = await supabase
    .from('place_family_members')
    .select('family_id,user_id,role,display_name,joined_at')
    .in('family_id', familyIds)
    .order('joined_at', { ascending: true })

  return { data: data || [], userId, error: error || null }
}

export async function updateOwnPlaceDisplayName(value) {
  if (!supabase) return { data: null, error: new Error('Supabase är inte anslutet.') }

  const displayName = String(value || '').trim()
  if (!displayName) return { data: null, error: new Error('Skriv ett namn.') }
  if (displayName.length > 80) return { data: null, error: new Error('Namnet får vara högst 80 tecken.') }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError }

  const userId = sessionData?.session?.user?.id || null
  if (!userId) return { data: null, error: new Error('Du måste vara inloggad.') }

  const { data, error } = await supabase
    .from('place_family_members')
    .update({ display_name: displayName })
    .eq('user_id', userId)
    .select('family_id,user_id,role,display_name,joined_at')

  return { data: data || [], error: error || null }
}

export function displayNameForUser(members, userId, fallback = 'Familjemedlem') {
  return (members || []).find((member) => member.user_id === userId)?.display_name?.trim() || fallback
}
