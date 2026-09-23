import { supabase } from '../../services/supabaseClient.js'
import { loadPlaceFamilyMembers } from './placeFamilyMemberService.js'
import { decodeFamilyLiveRow, loadFamilyLatestLocations } from './placeFamilyMapService.js'
import { PLACE_STATIONARY_HEARTBEAT_MS } from './placeLocationPersistence.js'

export const FAMILY_LIVE_FALLBACK_POLL_MS = 5000
export const FAMILY_MEMBER_REFRESH_MS = 10 * 60 * 1000
export const STATIONARY_LIVE_REALTIME_MESSAGES_PER_HOUR = 60 * 60 * 1000 / PLACE_STATIONARY_HEARTBEAT_MS

function familyIdsOf(members) {
  return new Set((members || []).map((member) => member.family_id).filter(Boolean))
}

function sameFamilyIds(left, right) {
  if (left.size !== right.size) return false
  for (const id of left) if (!right.has(id)) return false
  return true
}

function locationIdentity(location) {
  return `${location.family_id}:${location.user_id || location.owner_user_id}`
}

async function defaultLoadLocations(members) {
  return loadFamilyLatestLocations({ includeMembers: false, members })
}

export function startFamilyLiveFollow({
  client = supabase,
  loadLocations = defaultLoadLocations,
  loadMembers = loadPlaceFamilyMembers,
  decodeRow = decodeFamilyLiveRow,
  onLocations,
  onMembers,
  onStopped,
  fallbackPollMs = FAMILY_LIVE_FALLBACK_POLL_MS,
  memberRefreshMs = FAMILY_MEMBER_REFRESH_MS,
} = {}) {
  let stopped = false
  let realtimeReady = false
  let pollTimer = null
  let memberTimer = null
  let channel = null
  let authSubscription = null
  let userId = null
  let members = []
  let familyIds = new Set()
  let locations = []

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  function stop() {
    if (stopped) return
    stopped = true
    realtimeReady = false
    stopPolling()
    if (memberTimer) clearInterval(memberTimer)
    memberTimer = null
    authSubscription?.unsubscribe?.()
    authSubscription = null
    if (channel) client?.removeChannel?.(channel)
    channel = null
  }

  function startPolling() {
    if (stopped || realtimeReady || pollTimer) return
    pollTimer = setInterval(() => {
      if (stopped || realtimeReady) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void refreshLocations()
    }, fallbackPollMs)
  }

  async function refreshMembers(reason) {
    const result = await loadMembers()
    if (stopped) return result
    const nextMembers = Array.isArray(result?.data) ? result.data : []
    const nextFamilyIds = familyIdsOf(nextMembers)
    const familyChanged = !sameFamilyIds(familyIds, nextFamilyIds)
    members = nextMembers
    familyIds = nextFamilyIds
    if (result?.userId) userId = result.userId
    onMembers?.(result, reason)
    if (familyChanged && reason !== 'start') await refreshLocations()
    return result
  }

  async function refreshLocations() {
    const result = await loadLocations(members)
    if (stopped) return
    if (!result?.error) locations = Array.isArray(result?.data) ? result.data : []
    onLocations?.(result)
  }

  async function applyLocationEvent(payload) {
    if (stopped) return
    const eventType = payload?.eventType || payload?.event
    const row = eventType === 'DELETE' ? payload?.old : payload?.new
    if (!row) return
    if (row.recipient_user_id && userId && row.recipient_user_id !== userId) return
    if (row.family_id && familyIds.size && !familyIds.has(row.family_id)) return
    if (eventType === 'DELETE') {
      const key = locationIdentity(row)
      locations = locations.filter((location) => locationIdentity(location) !== key)
      onLocations?.({ data: locations, error: null })
      return
    }
    try {
      const decoded = await decodeRow(row, members)
      if (stopped || !decoded) return
      const key = locationIdentity(decoded)
      const without = locations.filter((location) => locationIdentity(location) !== key)
      locations = [decoded, ...without]
      onLocations?.({ data: locations, error: null })
    } catch (error) {
      console.warn('E2EE family live decrypt failed:', error?.message || error)
    }
  }

  void (async () => {
    const started = await refreshMembers('start')
    if (stopped) return
    if (!started?.userId) {
      onStopped?.()
      stop()
      return
    }
    await refreshLocations()
    if (stopped) return

    memberTimer = setInterval(() => {
      if (!stopped) void refreshMembers('refresh')
    }, memberRefreshMs)

    if (!client?.channel || !userId) {
      startPolling()
      return
    }

    channel = client.channel(`place-family-live-${userId}`)
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'place_e2ee_live_locations',
      filter: `recipient_user_id=eq.${userId}`,
    }, (payload) => {
      void applyLocationEvent(payload)
    })
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'place_family_members',
    }, () => {
      void refreshMembers('membership')
    })
    channel.subscribe((status) => {
      if (stopped) return
      if (status === 'SUBSCRIBED') {
        realtimeReady = true
        stopPolling()
        void refreshLocations()
        return
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeReady = false
        startPolling()
      }
    })

    const auth = client.auth?.onAuthStateChange?.((event, session) => {
      if (stopped) return
      const nextUserId = session?.user?.id || null
      if (event === 'SIGNED_OUT' || (!nextUserId && event !== 'INITIAL_SESSION')) {
        onLocations?.({ data: [], error: null, signedOut: true })
        onStopped?.()
        stop()
        return
      }
      if (nextUserId && nextUserId !== userId) {
        onStopped?.()
        stop()
      }
    })
    authSubscription = auth?.data?.subscription || null
  })()

  return stop
}
