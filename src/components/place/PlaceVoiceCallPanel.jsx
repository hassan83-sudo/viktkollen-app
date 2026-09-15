import { useEffect, useState } from 'react'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { loadActivePlaceVoiceCalls, startPlaceVoiceCall, subscribePlaceVoiceCalls, updatePlaceVoiceCall } from '../../features/place/placeVoiceCallService.js'

function PlaceVoiceCallPanel({ familyId, targetUserId, familyMembers, open, onClose }) {
  const [calls,setCalls]=useState([]),[userId,setUserId]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  async function refresh(){const r=await loadActivePlaceVoiceCalls();setUserId(r.userId||null);setCalls(r.data||[]);if(r.error)setNotice(r.error.message||'Samtalet kunde inte hämtas.')}
  useEffect(()=>{refresh();return subscribePlaceVoiceCalls(()=>refresh())},[])
  if(!open)return null
  const relevant=calls.find(c=>c.family_id===familyId&&((c.caller_user_id===userId&&c.callee_user_id===targetUserId)||(c.callee_user_id===userId&&c.caller_user_id===targetUserId)))
  const incoming=relevant?.callee_user_id===userId&&relevant.status==='ringing'
  const outgoing=relevant?.caller_user_id===userId&&relevant.status==='ringing'
  const accepted=relevant?.status==='accepted'
  const targetName=displayNameForUser(familyMembers,targetUserId)
  async function start(){setBusy(true);setNotice('');const r=await startPlaceVoiceCall({familyId,calleeUserId:targetUserId});if(r.error)setNotice(r.error.message||'Samtalet kunde inte startas.');else{setCalls(c=>[r.data,...c]);setNotice(`Ringer ${targetName}…`)}setBusy(false)}
  async function update(status){if(!relevant)return;setBusy(true);const r=await updatePlaceVoiceCall(relevant.id,status);if(r.error)setNotice(r.error.message||'Samtalet kunde inte uppdateras.');else await refresh();setBusy(false)}
  return <section className="family-map-history" aria-label={`Prata med ${targetName}`}>
    <div className="family-map-history-heading"><strong>📞 Prata · {targetName}</strong><button type="button" onClick={onClose}>Stäng</button></div>
    {!relevant?<><p>Starta ett samtal med familjemedlemmen.</p><button type="button" onClick={start} disabled={busy||targetUserId===userId}>Ring</button></>:null}
    {outgoing?<><p>📞 Ringer {targetName}…</p><button type="button" onClick={()=>update('ended')} disabled={busy}>Avbryt</button></>:null}
    {incoming?<><p>📞 {targetName} ringer dig.</p><div className="family-map-person-actions"><button type="button" onClick={()=>update('accepted')} disabled={busy}>Svara</button><button type="button" onClick={()=>update('declined')} disabled={busy}>Avvisa</button></div></>:null}
    {accepted?<><p>🟢 Samtal pågår med {targetName}</p><small>Samtalet är anslutet i appen. Ljudkopplingen aktiveras i nästa steg.</small><br/><button type="button" onClick={()=>update('ended')} disabled={busy}>Avsluta samtal</button></>:null}
    {notice?<p className="family-map-card-notice" role="status">{notice}</p>:null}
  </section>
}
export default PlaceVoiceCallPanel
