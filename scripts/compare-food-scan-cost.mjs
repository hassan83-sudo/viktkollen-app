// Isolated five-photo cost comparison. Never logs image contents or credentials.
// Usage: OPENAI_API_KEY=... node scripts/compare-food-scan-cost.mjs image1.jpg ... image5.jpg
// Optional: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY enable live food-bank matching.
// This is a prompt benchmark, NOT the production endpoint; baseline is a proxy.
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const files = process.argv.slice(2)
if (files.length !== 5) {
  console.error('Provide exactly five local JPEG, PNG or WebP images.')
  process.exit(2)
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required. No requests made.')
  process.exit(2)
}
const model = process.env.NUTRITION_PHOTO_BENCH_MODEL || 'gpt-4.1-mini'
const basePrompt = [
  'Analyze the food photo. Identify every visible food component including sauces, oils, breading and toppings.',
  'Estimate gramsMin and gramsMax for each component and estimate calories, proteinG, carbsG, fatG.',
  'Do not invent invisible ingredients. Account for cooking method. Return JSON only:',
  '{"components":[{"name":"food","gramsMin":100,"gramsMax":150,"calories":100,"proteinG":10,"carbsG":10,"fatG":3}]}'
].join(' ')
const optimizedPrompt = [
  'Identify visible foods, cooking method, sauce and portion size in this photo.',
  'Return JSON only, with no nutrition calculations:',
  '{"components":[{"name":"food","gramsMin":100,"gramsMax":150,"cookingMethod":"boiled","confidence":"medium"}]}',
  'Do not invent hidden foods; use null grams if impossible to estimate.'
].join(' ')
const priceIn = Number(process.env.BENCH_INPUT_USD_PER_MILLION || 0.4)
const priceOut = Number(process.env.BENCH_OUTPUT_USD_PER_MILLION || 1.6)
const sekPerUsd = Number(process.env.BENCH_SEK_PER_USD || 10)
const safeNum = x => Number.isFinite(Number(x)) ? Number(x) : 0
const mean = (a,b) => (safeNum(a)+safeNum(b))/2
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim()
  return JSON.parse(cleaned)
}
async function analyze(imageUrl,prompt) {
  const response = await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,max_output_tokens:2000,input:[{role:'user',content:[
      {type:'input_text',text:prompt},{type:'input_image',detail:'high',image_url:imageUrl}
    ]}]})
  })
  const json=await response.json()
  if(!response.ok) throw Error(`OpenAI HTTP ${response.status}: ${json.error?.code || 'unknown'}`)
  const text=json.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')||''
  const usage=json.usage||{}
  const costUsd=(safeNum(usage.input_tokens)*priceIn+safeNum(usage.output_tokens)*priceOut)/1e6
  let components=[]
  try {components=parseJson(text).components||[]}catch { /* count as invalid output */ }
  return {components,valid:Array.isArray(components)&&components.length>0,
    inputTokens:safeNum(usage.input_tokens),outputTokens:safeNum(usage.output_tokens),
    estimatedSek:costUsd*sekPerUsd}
}
function normalize(s){return String(s||'').toLocaleLowerCase('sv-SE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9åäö ]/gi,'').trim().replace(/\s+/g,' ')}
async function bankMatch(name){
  const url=process.env.SUPABASE_URL
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key)return null
  const q=new URL('/rest/v1/nutrition_food_bank',url)
  q.searchParams.set('select','name,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g')
  q.searchParams.set('normalized_name',`eq.${normalize(name)}`)
  q.searchParams.set('limit','2')
  const res=await fetch(q,{headers:{apikey:key,Authorization:`Bearer ${key}`}})
  if(!res.ok)throw Error(`Food bank lookup failed HTTP ${res.status}`)
  const rows=await res.json()
  return rows.length===1?rows[0]:null
}
const results=[]
for(let i=0;i<files.length;i++){
  const file=files[i]
  const type={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[extname(file).toLowerCase()]
  if(!type)throw Error(`Unsupported image type: ${i+1}`)
  if((await stat(file)).size>8_000_000)throw Error(`Image ${i+1} exceeds 8MB`)
  const imageUrl=`data:${type};base64,${(await readFile(file)).toString('base64')}`
  const baseline=await analyze(imageUrl,basePrompt)
  const optimized=await analyze(imageUrl,optimizedPrompt)
  let matched=0
  const totals={calories:0,protein:0,carbs:0,fat:0}
  for(const item of optimized.components){
    const food=await bankMatch(item.name)
    if(!food)continue
    matched++
    const factor=mean(item.gramsMin,item.gramsMax)/100
    totals.calories+=safeNum(food.calories_per_100g)*factor
    totals.protein+=safeNum(food.protein_per_100g)*factor
    totals.carbs+=safeNum(food.carbs_per_100g)*factor
    totals.fat+=safeNum(food.fat_per_100g)*factor
  }
  results.push({photo:i+1,baselineValid:baseline.valid,optimizedValid:optimized.valid,
    baselineTokens:baseline.inputTokens+baseline.outputTokens,
    optimizedTokens:optimized.inputTokens+optimized.outputTokens,
    baselineSek:+baseline.estimatedSek.toFixed(5),optimizedSek:+optimized.estimatedSek.toFixed(5),
    detected:optimized.components.length,bankMatched:matched,
    bankNutrition:matched?Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,+v.toFixed(1)])):null})
  console.log(`Photo ${i+1}/5 completed`)
}
console.table(results)
const sum=key=>results.reduce((a,x)=>a+x[key],0)
console.log(JSON.stringify({baselineEstimatedSek:+sum('baselineSek').toFixed(5),
  optimizedEstimatedSek:+sum('optimizedSek').toFixed(5),
  savingsPercent:sum('baselineSek')?+(100*(1-sum('optimizedSek')/sum('baselineSek'))).toFixed(1):null,
  bankMatches:sum('bankMatched'),detected:sum('detected'),
  note:'Estimated token costs only; price assumptions from BENCH_* variables. Baseline prompt is a proxy, not the production prompt. Compare food accuracy manually.'},null,2))
