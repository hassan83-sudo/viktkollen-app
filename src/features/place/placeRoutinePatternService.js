import { loadOwnPlaceHistory } from './placeHistoryService.js'

function bucket(value,size){return Math.round(Number(value)/size)*size}
function keyFor(point){return `${bucket(point.latitude,0.002)}:${bucket(point.longitude,0.002)}`}

export async function analyzeOwnPlaceRoutine(){
  const result=await loadOwnPlaceHistory()
  if(result.error)return {data:null,error:result.error}
  const points=(result.data||[]).filter(p=>!p.locked&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)))
  const days=new Set(points.map(p=>new Date(p.recordedAt||p.created_at).toDateString()))
  if(days.size<3||points.length<12)return {data:{ready:false,days:days.size,points:points.length},error:null}
  const byHour=new Map()
  for(const p of points){const d=new Date(p.recordedAt||p.created_at);if(Number.isNaN(d.getTime()))continue;const hour=d.getHours(),k=keyFor(p),map=byHour.get(hour)||new Map();map.set(k,(map.get(k)||0)+1);byHour.set(hour,map)}
  const latest=points.slice().sort((a,b)=>new Date(a.recordedAt||a.created_at)-new Date(b.recordedAt||b.created_at)).at(-1)
  const hour=new Date(latest.recordedAt||latest.created_at).getHours(),map=byHour.get(hour)||new Map(),current=keyFor(latest),total=[...map.values()].reduce((a,b)=>a+b,0),count=map.get(current)||0,usual=count>=2&&count/Math.max(1,total)>=0.25
  return {data:{ready:true,days:days.size,points:points.length,usual,message:usual?'Positionen stämmer med ett återkommande mönster för ungefär den här tiden.':'Positionen skiljer sig från de vanligaste sparade platserna för ungefär den här tiden.'},error:null}
}
