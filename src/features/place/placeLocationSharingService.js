import { supabase } from '../../services/supabaseClient.js'
import { recordEncryptedPlaceHistoryPoint } from './placeHistoryService.js'

let activeWatchId = null
let activeVisibilityHandler = null
let activeSharingState = null
let lastActiveWriteAt = 0
let activeWriteInFlight = false
const positionFrequencyStorageKey = 'viktkollen.place.positionFrequency.v1'
const positionFrequencyIntervals = Object.freeze({ live: 5000, '10m': 10 * 60 * 1000, '30m': 30 * 60 * 1000, '1h': 60 * 60 * 1000, battery: 2 * 60 * 1000 })
let activeSharingStatus = {
  active: false,
  paused: false,
  lastUpdatedAt: null,
  accuracyMeters: null,
}
const activeSharingStatusListeners = new Set()

function notifyActiveSharingStatus(patch) {
  activeSharingStatus = { ...activeSharingStatus, ...patch }
  activeSharingStatusListeners.forEach((listener) => listener({ ...activeSharingStatus }))
}

export function getActiveLocationSharingStatus() {
  return { ...activeSharingStatus }
}

export function subscribeActiveLocationSharingStatus(listener) {
  if (typeof listener !== 'function') return () => {}
  activeSharingStatusListeners.add(listener)
  listener({ ...activeSharingStatus })
  return () => activeSharingStatusListeners.delete(listener)
}

export function getPlacePositionFrequency() {
  if (typeof window === 'undefined') return '30m'
  const value = window.localStorage.getItem(positionFrequencyStorageKey)
  return Object.prototype.hasOwnProperty.call(positionFrequencyIntervals, value) ? value : '30m'
}

export function setPlacePositionFrequency(value) {
  const normalized = Object.prototype.hasOwnProperty.call(positionFrequencyIntervals, value) ? value : '30m'
  if (typeof window !== 'undefined') window.localStorage.setItem(positionFrequencyStorageKey, normalized)
  if (activeSharingState) configureActiveLocationSharing(activeSharingState)
  return normalized
}

function locationOptions({ batterySaverEnabled = false } = {}) {
  return {
    enableHighAccuracy: !batterySaverEnabled,
    maximumAge: batterySaverEnabled ? 5 * 60 * 1000 : 30000,
    timeout: batterySaverEnabled ? 10000 : 15000,
  }
}

function getCurrentPosition({ batterySaverEnabled = false } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Platsåtkomst stöds inte på den här enheten.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, locationOptions({ batterySaverEnabled }))
  })
}

export function requestPlaceLocationPermission() { return getCurrentPosition() }

async function getSignedInUserId() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data?.session?.user?.id || null
}

async function getPrimaryFamilyId(userId) {
  const { data, error } = await supabase.from('place_family_members').select('family_id').eq('user_id', userId).order('joined_at', { ascending: true }).limit(1).maybeSingle()
  if (error) throw error
  return data?.family_id || null
}

async function disableRemoteSharing(userId, consentGrantedAt) {
  const { error } = await supabase.from('place_location_shares').update({ consent_granted_at: consentGrantedAt || null, sharing_enabled: false, latitude: null, longitude: null, accuracy_meters: null, location_recorded_at: null, updated_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw error
}

async function persistSharedPosition(state, position) {
  if (!supabase) return { ok: false, reason: 'supabase-unavailable' }
  const userId = await getSignedInUserId()
  if (!userId) return { ok: false, reason: 'signed-out' }
  const familyId = await getPrimaryFamilyId(userId)
  if (!familyId) return { ok: false, reason: 'no-family-membership' }
  const recordedAt = position.timestamp ? new Date(position.timestamp).toISOString() : new Date().toISOString()
  const accuracyMeters = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
  const consentGrantedAt = state?.consentGrantedAt || new Date().toISOString()
  const { error } = await supabase.from('place_location_shares').upsert({ user_id: userId, family_id: familyId, consent_granted_at: consentGrantedAt, sharing_enabled: true, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: accuracyMeters, location_recorded_at: recordedAt, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
  notifyActiveSharingStatus({ active: typeof document === 'undefined' || document.visibilityState !== 'hidden', paused: typeof document !== 'undefined' && document.visibilityState === 'hidden', lastUpdatedAt: recordedAt, accuracyMeters })
  void recordEncryptedPlaceHistoryPoint({ userId, familyId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters, recordedAt }).catch((historyError) => console.warn('Encrypted place history write failed:', historyError?.message || historyError))
  void supabase.functions.invoke('place-push', { body: { action: 'evaluate' } }).then(({ error: pushError }) => { if (pushError) console.warn('Safe-place push evaluation failed:', pushError?.message || pushError) }).catch((pushError) => console.warn('Safe-place push evaluation failed:', pushError?.message || pushError))
  return { ok: true, sharingEnabled: true, recordedAt }
}

export async function syncPlaceLocationSharing(state) {
  if (!supabase) return { ok: false, reason: 'supabase-unavailable' }
  const userId = await getSignedInUserId()
  if (!userId) return { ok: false, reason: 'signed-out' }
  const consentGranted = Boolean(state?.consentGranted)
  const sharingEnabled = Boolean(state?.sharingEnabled && consentGranted)
  const frequency = getPlacePositionFrequency()
  const batterySaverEnabled = Boolean(state?.batterySaverEnabled || frequency === 'battery')
  const consentGrantedAt = consentGranted ? state?.consentGrantedAt || new Date().toISOString() : null
  if (!sharingEnabled) {
    notifyActiveSharingStatus({ active: false, paused: false })
    await disableRemoteSharing(userId, consentGrantedAt)
    return { ok: true, sharingEnabled: false }
  }
  const position = await getCurrentPosition({ batterySaverEnabled })
  return persistSharedPosition(state, position)
}

export function stopActiveLocationSharing() {
  if (typeof navigator !== 'undefined' && navigator.geolocation && activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId)
  if (typeof document !== 'undefined' && activeVisibilityHandler) document.removeEventListener('visibilitychange', activeVisibilityHandler)
  activeWatchId = null
  activeVisibilityHandler = null
  activeSharingState = null
  lastActiveWriteAt = 0
  activeWriteInFlight = false
}

export function configureActiveLocationSharing(state) {
  stopActiveLocationSharing()
  const consentGranted = Boolean(state?.consentGranted)
  const sharingEnabled = Boolean(state?.sharingEnabled && consentGranted)
  if (!sharingEnabled) { notifyActiveSharingStatus({ active: false, paused: false }); return { active: false, reason: 'sharing-disabled' } }
  if (typeof navigator === 'undefined' || !navigator.geolocation || typeof document === 'undefined') { notifyActiveSharingStatus({ active: false, paused: true }); return { active: false, reason: 'unsupported' } }
  activeSharingState = state
  lastActiveWriteAt = 0
  const startWatch = () => {
    if (!activeSharingState || activeWatchId !== null || document.visibilityState === 'hidden') return
    const frequency = getPlacePositionFrequency()
    const batterySaverEnabled = Boolean(activeSharingState?.batterySaverEnabled || frequency === 'battery')
    const minWriteInterval = positionFrequencyIntervals[frequency] || positionFrequencyIntervals['30m']
    activeWatchId = navigator.geolocation.watchPosition((position) => {
      const now = Date.now()
      if (activeWriteInFlight || now - lastActiveWriteAt < minWriteInterval) return
      lastActiveWriteAt = now
      activeWriteInFlight = true
      void persistSharedPosition(activeSharingState, position).catch((error) => console.warn('Active place sharing update failed:', error?.message || error)).finally(() => { activeWriteInFlight = false })
    }, (error) => console.warn('Active place sharing GPS unavailable:', error?.message || error), locationOptions({ batterySaverEnabled }))
    notifyActiveSharingStatus({ active: true, paused: false })
  }
  const stopWatch = () => {
    if (activeWatchId === null) return
    navigator.geolocation.clearWatch(activeWatchId)
    activeWatchId = null
    notifyActiveSharingStatus({ active: false, paused: true })
  }
  activeVisibilityHandler = () => { if (document.visibilityState === 'hidden') { stopWatch(); return } lastActiveWriteAt = 0; startWatch() }
  document.addEventListener('visibilitychange', activeVisibilityHandler)
  startWatch()
  return { active: activeWatchId !== null, reason: activeWatchId !== null ? 'watching' : 'hidden' }
}
