import { supabase } from '../../services/supabaseClient.js'

function unavailable(message = 'Familjekoppling kräver att du är inloggad.') {
  return { data: null, error: new Error(message) }
}

async function getSessionUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

export async function loadFamilyAccessState() {
  if (!supabase) return { data: { hasFamily: false, memberships: [] }, error: new Error('Supabase är inte anslutet.') }

  try {
    const userId = await getSessionUserId()
    if (!userId) return { data: { hasFamily: false, memberships: [] }, error: unavailable().error }

    const { data, error } = await supabase
      .from('place_family_members')
      .select('family_id,user_id,role,joined_at')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })

    const memberships = data || []
    return {
      data: {
        userId,
        hasFamily: memberships.length > 0,
        memberships,
      },
      error: error || null,
    }
  } catch (error) {
    return { data: { hasFamily: false, memberships: [] }, error }
  }
}

export async function createFamilyInvite() {
  if (!supabase) return unavailable('Familjekoppling är inte ansluten.')

  try {
    const userId = await getSessionUserId()
    if (!userId) return unavailable()

    const state = await loadFamilyAccessState()
    if (state.error) return { data: null, error: state.error }

    const rpcName = state.data.hasFamily
      ? 'viktkollen_create_place_family_invite'
      : 'viktkollen_create_place_family'

    const { data, error } = await supabase.rpc(rpcName)
    const row = Array.isArray(data) ? data[0] : data

    return { data: row || null, error: error || null }
  } catch (error) {
    return { data: null, error }
  }
}

export async function acceptFamilyInvite(code) {
  if (!supabase) return unavailable('Familjekoppling är inte ansluten.')

  const inviteCode = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{8}$/.test(inviteCode)) {
    return unavailable('Koden ska vara 8 tecken.')
  }

  try {
    const userId = await getSessionUserId()
    if (!userId) return unavailable()

    const { data, error } = await supabase.rpc('viktkollen_accept_place_family_invite', {
      invite_code: inviteCode,
    })

    const row = Array.isArray(data) ? data[0] : data
    return { data: row || null, error: error || null }
  } catch (error) {
    return { data: null, error }
  }
}
