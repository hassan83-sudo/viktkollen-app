import { supabase } from '../../services/supabaseClient.js'

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = globalThis.atob(base64)
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

function unsupported(message) {
  return { data: null, error: new Error(message) }
}

export async function getPlacePushStatus() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { status: 'unsupported', label: 'Stöds inte på den här enheten' }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unsupported', label: 'Stöds inte på den här enheten' }
  }
  if (Notification.permission === 'denied') {
    return { status: 'denied', label: 'Tillstånd nekat' }
  }
  if (Notification.permission !== 'granted') {
    return { status: 'inactive', label: 'Inte aktiverad ännu' }
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    if (!registration) return { status: 'inactive', label: 'Inte aktiverad ännu' }

    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return { status: 'inactive', label: 'Inte aktiverad ännu' }

    return { status: 'active', label: 'Aktiv' }
  } catch {
    return { status: 'unknown', label: 'Kunde inte kontrollera status' }
  }
}

export async function ensurePlacePushSubscription() {
  if (!supabase) return unsupported('Pushnotiser kräver att Supabase är anslutet.')
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return unsupported('Pushnotiser stöds inte i den här miljön.')
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return unsupported('Pushnotiser stöds inte av den här webbläsaren.')
  }

  // Start permission request before the first await so this can be called directly
  // from the user's safe-place notification toggle gesture.
  const permissionPromise = Notification.permission === 'default'
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission)

  const permission = await permissionPromise
  if (permission !== 'granted') return unsupported('Tillåt notiser i webbläsaren för att få pushnotiser.')

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError }
  const userId = sessionData?.session?.user?.id
  if (!userId) return unsupported('Du måste vara inloggad för pushnotiser.')

  const registration = await navigator.serviceWorker.register('/place-push-sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  const { data: keyData, error: keyError } = await supabase.functions.invoke('place-push', {
    body: { action: 'public-key' },
  })
  if (keyError) return { data: null, error: keyError }
  if (!keyData?.publicKey) return unsupported('Pushnyckeln kunde inte hämtas.')

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    })
  }

  const subscriptionJson = subscription.toJSON()
  const p256dh = subscriptionJson?.keys?.p256dh
  const authKey = subscriptionJson?.keys?.auth
  if (!subscription.endpoint || !p256dh || !authKey) {
    return unsupported('Pushprenumerationen saknar nödvändiga nycklar.')
  }

  const { error } = await supabase
    .from('place_push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth_key: authKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' })

  return {
    data: error ? null : { enabled: true, endpoint: subscription.endpoint },
    error: error || null,
  }
}
