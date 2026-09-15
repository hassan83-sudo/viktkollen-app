import { supabase } from '../../services/supabaseClient.js'

const peers=new Map()
async function userId(){const {data}=await supabase.auth.getSession();return data?.session?.user?.id||null}
async function signal(callId,type,payload){const uid=await userId();if(!uid)throw new Error('Du behöver vara inloggad.');const {error}=await supabase.from('place_voice_call_signals').insert({call_id:callId,sender_user_id:uid,signal_type:type,payload});if(error)throw error}

export async function startPlaceVoiceAudio({callId,initiator,onRemoteStream,onState}){
 if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Röstsamtal stöds inte i den här webbläsaren.')
 stopPlaceVoiceAudio(callId)
 const uid=await userId();if(!uid)throw new Error('Du behöver vara inloggad.')
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
 const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]})
 stream.getTracks().forEach(track=>pc.addTrack(track,stream))
 pc.ontrack=e=>onRemoteStream?.(e.streams?.[0]||new MediaStream([e.track]))
 pc.onconnectionstatechange=()=>onState?.(pc.connectionState)
 pc.onicecandidate=e=>{if(e.candidate)signal(callId,'ice',e.candidate.toJSON()).catch(()=>{})}
 let applying=false
 async function apply(row){if(!row||row.sender_user_id===uid||applying)return;applying=true;try{if(row.signal_type==='offer'&&!initiator){await pc.setRemoteDescription(row.payload);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal(callId,'answer',pc.localDescription.toJSON())}else if(row.signal_type==='answer'&&initiator&&!pc.remoteDescription){await pc.setRemoteDescription(row.payload)}else if(row.signal_type==='ice'){try{await pc.addIceCandidate(row.payload)}catch{}}}finally{applying=false}}
 const {data:old}=await supabase.from('place_voice_call_signals').select('id,sender_user_id,signal_type,payload').eq('call_id',callId).order('id')
 for(const row of old||[])await apply(row)
 const channel=supabase.channel(`voice-audio-${callId}-${uid}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'place_voice_call_signals',filter:`call_id=eq.${callId}`},p=>apply(p.new)).subscribe()
 peers.set(callId,{pc,stream,channel})
 if(initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await signal(callId,'offer',pc.localDescription.toJSON())}
 return {stream,pc}
}

export function stopPlaceVoiceAudio(callId){const item=peers.get(callId);if(!item)return;item.stream?.getTracks().forEach(t=>t.stop());item.pc?.close();if(item.channel&&supabase)supabase.removeChannel(item.channel);peers.delete(callId)}
