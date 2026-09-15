import { supabase } from '../../services/supabaseClient.js'
import { loadPlaceFamilyMembers } from './placeFamilyMemberService.js'
import { decryptPlacePayload, ensurePlaceE2eeIdentity } from './placeE2eeService.js'

function getUnavailableResult(){return{data:[],error:new Error('Platsdelning kräver att du är inloggad.')}}
export async function loadFamilyLatestLocations(){
 if(!supabase)return getUnavailableResult()
 const{data:sessionData,error:sessionError}=await supabase.auth.getSession(),userId=sessionData?.session?.user?.id
 if(sessionError)return{data:[],error:sessionError};if(!userId)return getUnavailableResult()
 try{await ensurePlaceE2eeIdentity()}catch(e){return{data:[],error:e}}
 const{data:memberships,error:membershipError}=await supabase.from('place_family_members').select('family_id').eq('user_id',userId)
 if(membershipError)return{data:[],error:membershipError}
 const familyIds=[...new Set((memberships||[]).map(r=>r.family_id).filter(Boolean))];if(!familyIds.length)return{data:[],error:null}
 const[{data,error},memberResult]=await Promise.all([supabase.from('place_location_shares').select('user_id,family_id,encrypted_payload,encrypted_iv,recipient_user_id,location_recorded_at,updated_at').in('family_id',familyIds).eq('sharing_enabled',true).not('consent_granted_at','is',null).order('location_recorded_at',{ascending:false}),loadPlaceFamilyMembers()])
 if(error)return{data:[],error}
 const names=new Map((memberResult.data||[]).map(m=>[m.user_id,m.display_name?.trim()||null])),decoded=[]
 for(const row of data||[]){if(!row.encrypted_payload||!row.encrypted_iv)continue;try{const p=await decryptPlacePayload(row.user_id,row);decoded.push({...row,latitude:Number(p.latitude),longitude:Number(p.longitude),accuracy_meters:p.accuracy_meters??null,location_recorded_at:p.location_recorded_at||row.location_recorded_at,display_name:names.get(row.user_id)||null})}catch(e){console.warn('E2EE place decrypt failed:',e?.message||e)}}
 return{data:decoded,error:memberResult.error||null}
}
