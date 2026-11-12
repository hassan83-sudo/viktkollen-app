import { supabase } from './supabaseClient.js'
import { readWardrobe, updateWardrobe, wardrobeChangedEvent } from './wardrobeStorage.js'

const hasData = (wardrobe) => Boolean(wardrobe?.garments?.length || wardrobe?.outfits?.length || wardrobe?.worn?.length)
let applyingRemote = false

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
    const { data, error } = await supabase.from('user_wardrobes').select('wardrobe').eq('user_id', identity).maybeSingle()
    if (!active || userId !== identity) return
    if (error) { onStatus('Molnsynkronisering är inte tillgänglig. Dina kläder finns kvar lokalt.'); return }
    if (data?.wardrobe && hasData(data.wardrobe)) {
      if (revision !== startingRevision) { onStatus('Lokala ändringar upptäcktes. Synkroniseringen pausades för att skydda dina kläder.'); return }
      const local = readWardrobe()
      if (hasData(local) && JSON.stringify(local) !== JSON.stringify(data.wardrobe)) {
        // Never overwrite either existing wardrobe without explicit conflict resolution.
        onStatus('Det finns kläder både lokalt och på kontot. Ingen garderob har skrivits över.')
        return
      }
      applyingRemote = true
      try { updateWardrobe(() => data.wardrobe) } catch { onStatus('Kunde inte läsa kontots garderob lokalt.'); return } finally { applyingRemote = false }
      initialized = true
      onStatus('Garderoben är synkroniserad med ditt konto.')
    } else {
      initialized = true
      await upload()
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
