import { supabase } from '../../services/supabaseClient.js'

async function currentUserId(){
  if(!supabase)return null
  const {data}=await supabase.auth.getSession()
  return data?.session?.user?.id||null
}

export async function startPlaceVoiceCall({familyId,calleeUserId}){
  if(!supabase)return {data:null,error:new Error('Supabase saknas.')}
  const callerUserId=await currentUserId()
  if(!callerUserId)return {data:null,error:new Error('Du behöver vara inloggad.')}
  const {data,error}=await supabase.from('place_voice_calls').insert({family_id:familyId,caller_user_id:callerUserId,callee_user_id:calleeUserId,status:'ringing'}).select('id,family_id,caller_user_id,callee_user_id,status,created_at').single()
  return {data,error}
}

export async function updatePlaceVoiceCall(id,status){
  if(!supabase)return {data:null,error:new Error('Supabase saknas.')}
  const updates={status}
  if(status==='accepted')updates.answered_at=new Date().toISOString()
  if(status==='ended'||status==='declined')updates.ended_at=new Date().toISOString()
  const {data,error}=await supabase.from('place_voice_calls').update(updates).eq('id',id).select('id,family_id,caller_user_id,callee_user_id,status,created_at,answered_at,ended_at').single()
  return {data,error}
}

export async function loadActivePlaceVoiceCalls(){
  if(!supabase)return {data:[],userId:null,error:new Error('Supabase saknas.')}
  const userId=await currentUserId()
  if(!userId)return {data:[],userId:null,error:new Error('Du behöver vara inloggad.')}
  const {data,error}=await supabase.from('place_voice_calls').select('id,family_id,caller_user_id,callee_user_id,status,created_at,answered_at').in('status',['ringing','accepted']).order('created_at',{ascending:false})
  return {data:data||[],userId,error}
}

export function subscribePlaceVoiceCalls(onChange){
  if(!supabase)return ()=>{}
  const channel=supabase.channel(`place-voice-calls-${Math.random().toString(36).slice(2)}`).on('postgres_changes',{event:'*',schema:'public',table:'place_voice_calls'},payload=>onChange?.(payload)).subscribe()
  return ()=>{supabase.removeChannel(channel)}
}
