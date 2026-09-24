import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { displayNameForUser } from '../../features/place/placeFamilyMemberService.js'
import { loadActivePlaceVoiceCalls, startPlaceVoiceCall, subscribePlaceVoiceCalls, updatePlaceVoiceCall } from '../../features/place/placeVoiceCallService.js'
import { setPlaceVoiceMicrophone, startPlaceVoiceAudio, stopPlaceVoiceAudio } from '../../features/place/placeVoiceAudioService.js'

function PlaceVoiceCallPanel({ familyId, targetUserId, familyMembers, open, onClose }) {
  const [calls,setCalls]=useState([]),[userId,setUserId]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[audioState,setAudioState]=useState(''),[walkie,setWalkie]=useState(false),[talking,setTalking]=useState(false)
  const audioRef=useRef(null),activeAudioCallRef=useRef(null)
  // A11Y-8E: walkie-talkie works without press-and-hold. The toggle button
  // (and keyboard/switch activation of the hold button) starts/stops talking
  // with the same setPlaceVoiceMicrophone path; holding still works too.
  // holdRef makes pointer release/leave only end a hold that the pointer
  // itself started, so it never cuts a toggle-started transmission.
  const { t } = useTranslation('place')
  const holdRef=useRef(false)
  async function refresh(){const r=await loadActivePlaceVoiceCalls();setUserId(r.userId||null);setCalls(r.data||[]);if(r.error)setNotice(r.error.message||'Samtalet kunde inte hämtas.')}
  useEffect(()=>{refresh();return subscribePlaceVoiceCalls(()=>refresh())},[])
  const relevant=calls.find(c=>c.family_id===familyId&&((c.caller_user_id===userId&&c.callee_user_id===targetUserId)||(c.callee_user_id===userId&&c.caller_user_id===targetUserId)))
  const incoming=relevant?.callee_user_id===userId&&relevant.status==='ringing',outgoing=relevant?.caller_user_id===userId&&relevant.status==='ringing',accepted=relevant?.status==='accepted',targetName=displayNameForUser(familyMembers,targetUserId)
  useEffect(()=>{if(!accepted||!relevant?.id||!userId){if(activeAudioCallRef.current){stopPlaceVoiceAudio(activeAudioCallRef.current);activeAudioCallRef.current=null;setAudioState('')}return}if(activeAudioCallRef.current===relevant.id)return;let cancelled=false;activeAudioCallRef.current=relevant.id;setAudioState('Ansluter ljud…');startPlaceVoiceAudio({callId:relevant.id,initiator:relevant.caller_user_id===userId,onRemoteStream:stream=>{if(cancelled)return;const el=audioRef.current;if(el){el.srcObject=stream;el.play().catch(()=>setAudioState('Tryck på skärmen om ljudet inte startar automatiskt.'))}},onState:state=>{if(!cancelled)setAudioState(state==='connected'?'🔊 Ljud anslutet':state==='failed'?'Ljudanslutningen misslyckades.':'Ansluter ljud…')}}).then(()=>{if(walkie)setPlaceVoiceMicrophone(relevant.id,false)}).catch(error=>{if(!cancelled){setAudioState('');setNotice(error?.name==='NotAllowedError'?'Mikrofonen är blockerad. Tillåt mikrofon för Viktkollen och försök igen.':error?.message||'Mikrofonen kunde inte startas.')}});return()=>{cancelled=true}},[accepted,relevant?.id,relevant?.caller_user_id,userId])
  useEffect(()=>{if(!accepted||!relevant?.id)return;setTalking(false);setPlaceVoiceMicrophone(relevant.id,!walkie)},[walkie,accepted,relevant?.id])
  useEffect(()=>()=>{if(activeAudioCallRef.current)stopPlaceVoiceAudio(activeAudioCallRef.current)},[])
  async function start(){setBusy(true);setNotice('');const r=await startPlaceVoiceCall({familyId,calleeUserId:targetUserId});if(r.error)setNotice(r.error.message||'Samtalet kunde inte startas.');else{setCalls(c=>[r.data,...c]);setNotice(`Ringer ${targetName}…`)}setBusy(false)}
  async function update(status){if(!relevant)return;setBusy(true);if(status==='ended'||status==='declined'){stopPlaceVoiceAudio(relevant.id);activeAudioCallRef.current=null}const r=await updatePlaceVoiceCall(relevant.id,status);if(r.error)setNotice(r.error.message||'Samtalet kunde inte uppdateras.');else await refresh();setBusy(false)}
  function talk(active){if(!walkie||!relevant?.id)return;setTalking(active);setPlaceVoiceMicrophone(relevant.id,active)}
  function startHold(){holdRef.current=true;talk(true)}
  function endHold(){if(!holdRef.current)return;holdRef.current=false;talk(false)}
  // A click without a pointer press (Enter, Space, switch access) toggles.
  function holdButtonClick(event){if(event.detail===0)talk(!talking)}
  if(!open)return null
  return <section className="family-map-history" aria-label={`Prata med ${targetName}`}><audio ref={audioRef} autoPlay playsInline/><div className="family-map-history-heading"><strong>📞 Prata · {targetName}</strong><button type="button" onClick={onClose}>Stäng</button></div>{!relevant?<><p>Starta ett röstsamtal med familjemedlemmen.</p><button type="button" onClick={start} disabled={busy||targetUserId===userId}>Ring</button></>:null}{outgoing?<><p>📞 Ringer {targetName}…</p><button type="button" onClick={()=>update('ended')} disabled={busy}>Avbryt</button></>:null}{incoming?<><p>📞 {targetName} ringer dig.</p><div className="family-map-person-actions"><button type="button" onClick={()=>update('accepted')} disabled={busy}>Svara</button><button type="button" onClick={()=>update('declined')} disabled={busy}>Avvisa</button></div></>:null}{accepted?<><p>🟢 Samtal pågår med {targetName}</p><small role="status">{audioState||'Mikrofonen startar när samtalet ansluts.'}</small><label className="family-map-frequency"><span>Walkie-talkie</span><input type="checkbox" checked={walkie} onChange={e=>setWalkie(e.target.checked)}/></label>{walkie?<div className="family-map-walkie"><p className="family-map-walkie-status" role="status">{talking?t('walkie.statusTalking'):t('walkie.statusReady')}</p><button type="button" className="family-map-walkie-toggle" onClick={()=>talk(!talking)}>{talking?t('walkie.stop'):t('walkie.start')}</button><small>{t('walkie.toggleHint')}</small><button type="button" aria-pressed={talking} onClick={holdButtonClick} onPointerDown={startHold} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold} style={{touchAction:'none'}}><span aria-hidden="true">🎙️ </span>{talking?t('walkie.holdActive'):t('walkie.hold')}</button><small>{t('walkie.holdHint')}</small></div>:null}<br/><button type="button" onClick={()=>update('ended')} disabled={busy}>Avsluta samtal</button></>:null}{notice?<p className="family-map-card-notice" role="status">{notice}</p>:null}</section>
}
export default PlaceVoiceCallPanel
