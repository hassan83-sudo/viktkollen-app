import { supabase } from './supabaseClient.js'
import { readWardrobe, updateWardrobe, wardrobeChangedEvent } from './wardrobeStorage.js'

const hasData = (wardrobe) => Boolean(wardrobe?.garments?.length || wardrobe?.outfits?.length || wardrobe?.worn?.length)
const syncedUserKey = 'viktkollen.notice.wardrobe.syncedUser.v1'
let applyingRemote = false

function combineWardrobes(remote, local) {
  const combineBy = (a = [], b = [], key) => {
    const merged = new Map()
    for (const item of a) if (item?.[key]) merged.set(item[key], item)
    for (const item of b) if (item?.[key] && !merged.has(item[key])) merged.set(item[key], item)
    return [...merged.values()]
  }
  return {
    garments: combineBy(remote.garments, local.garments, 'id'),
    outfits: combineBy(remote.outfits, local.outfits, 'id'),
    worn: combineBy(remote.worn, local.worn, 'date'),
    selectedGarmentIds: [...new Set([...(remote.selectedGarmentIds || []), ...(local.selectedGarmentIds || [])])],
  }
}

// Local data is kept until the cloud confirms a successful save.
export async function startWardrobeCloudSync(onStatus = () => {}) {
  if (!supabase) return () => {}
  let active = true
  let userId = null
  let initialized = false
  let pending = Promise.resolve()
  let revision = 0

  async function initialize(user) {
    initialized = false
    userId = user?.id || null
    if (!userId) { onStatus('Logga in för att synkronisera garderoben mellan enheter.'); return }
    const identity = userId
    const startingRevision = revision
    const previouslySyncedUser = window.localStorage.getItem(syncedUserKey)
    const { data, error } = await supabase.from('user_wardrobes').select('wardrobe').eq('user_id', identity).maybeSingle()
    if (!active || userId !== identity) return
    if (error) { onStatus('Molnsynkronisering är inte tillgänglig. Dina kläder finns kvar lokalt.'); return }
    if (data?.wardrobe && hasData(data.wardrobe)) {
      if (revision !== startingRevision) { onStatus('Lokala ändringar upptäcktes. Synkroniseringen pausades för att skydda dina kläder.'); return }
      const local = readWardrobe()
      const combined = hasData(local) && !previouslySyncedUser ? combineWardrobes(data.wardrobe, local) : data.wardrobe
      // Back up the combined wardrobe to the account before changing local storage.
      const { error: mergeError } = await supabase.from('user_wardrobes').update({ wardrobe: combined, updated_at: new Date().toISOString() }).eq('user_id', identity)
      if (!active || userId !== identity) return
      if (revision !== startingRevision) { onStatus('Lokala ändringar upptäcktes under synkronisering. Dina kläder är kvar lokalt.'); return }
      if (mergeError) { onStatus('Kunde inte säkerhetskopiera kläderna till kontot. Lokala kläder är oförändrade.'); return }
      applyingRemote = true
      try { updateWardrobe(() => combined) } catch { onStatus('Kläderna är sparade på kontot men kunde inte visas lokalt.'); return } finally { applyingRemote = false }
      window.localStorage.setItem(syncedUserKey, identity)
      initialized = true
      onStatus('Garderoben är synkroniserad med ditt konto.')
    } else {
      // Do not transfer a previous account's wardrobe into a different account.
      const firstWardrobe = previouslySyncedUser && previouslySyncedUser !== identity
        ? { garments: [], outfits: [], worn: [], selectedGarmentIds: [] }
        : readWardrobe()
      const { error: insertError } = await supabase.from('user_wardrobes').insert({ user_id: identity, wardrobe: firstWardrobe })
      if (!active || userId !== identity) return
      if (revision !== startingRevision) { onStatus('Lokala ändringar upptäcktes under synkronisering. Dina kläder är kvar lokalt.'); return }
      if (insertError) {
        onStatus('Kunde inte starta molnsynkronisering. Dina kläder finns kvar lokalt.')
        return
      }
      if (previouslySyncedUser && previouslySyncedUser !== identity) {
        applyingRemote = true
        try { updateWardrobe(() => firstWardrobe) } finally { applyingRemote = false }
      }
      window.localStorage.setItem(syncedUserKey, identity)
      initialized = true
      onStatus('Garderoben är sparad på ditt konto.')
    }
  }

  async function upload() {
    if (!active || !userId || !initialized) return
    const identity = userId
    const snapshot = readWardrobe()
    const { error } = await supabase.from('user_wardrobes').upsert({ user_id: identity, wardrobe: snapshot, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (!active || userId !== identity) return
    onStatus(error ? 'Molnsynkronisering misslyckades. Dina kläder finns kvar lokalt.' : 'Garderoben är sparad på ditt konto.')
  }

  const onLocalChange = () => {
    if (applyingRemote) return
    revision += 1
    if (initialized) pending = pending.then(upload, upload)
  }
  window.addEventListener(wardrobeChangedEvent, onLocalChange)
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== userId) void initialize(session?.user)
  })
  void supabase.auth.getUser().then(({ data }) => {
    if (active && data?.user?.id !== userId) void initialize(data?.user)
  })
  return () => {
    active = false
    window.removeEventListener(wardrobeChangedEvent, onLocalChange)
    listener.subscription.unsubscribe()
  }
}
