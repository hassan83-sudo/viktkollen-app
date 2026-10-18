import { readPlanComparison } from '../billing/planComparisonRead.js'

const planTopic = /abonnemang|priser|paket|subscription|\bplans?\b|pricing|suscripci[oó]n|planes|اشتراك|خطط/iu
const compare = /skillnad|jämför|jämföra|difference|compare|comparar|diferencia|فرق|قارن/iu
const money = /\b\d+(?:[.,]\d+)?\s*(?:kr|sek)\b/iu
const reference = /^(?:och\b|and\b|what about\b|hur många\b|how many\b|y\b|و|وماذا)/iu
const personalOrAction = /\b(?:mitt|min|mina|my|mi|cancel|change|delete|refund|byt|avsluta|radera|återbetala)\b|اشتراكي|حسابي|ألغ|احذف/iu

function isPlanQuestion(text) {
  return !personalOrAction.test(text) && (planTopic.test(text)
    || (money.test(text) && (compare.test(text) || /får|ingår|kostar|included|\bget\b|\bcost\b|incluye|مقابل/iu.test(text)))
    || (compare.test(text) && /gratis|free|premium|betald/iu.test(text)))
}

export function planQuestion(messages) {
  const latest = messages.at(-1)?.content || ''
  if (personalOrAction.test(latest)) return null
  if (isPlanQuestion(latest)) return latest
  if (!reference.test(latest.trim())) return null
  const parts = [latest]
  for (const item of messages.slice(0, -1).filter((message) => message.role === 'user').reverse()) {
    if (personalOrAction.test(item.content)) return null
    parts.unshift(item.content)
    if (isPlanQuestion(item.content)) return parts.join(' ')
    if (!reference.test(item.content.trim())) return null
  }
  return null
}

const copy = {
  sv: { intro: 'Verifierade aktiva katalogplaner, inte ett besked om din egen plan eller möjlighet att köpa. Kvoterna gäller enligt planjämförelsen i appen.', missing: 'Jag kan inte verifiera uppgifterna för den efterfrågade planen just nu. Jag gissar inte priser eller kvoter.', incomplete: 'Fullständiga kvoter saknas; jag kan inte jämföra dessa.', extra: 'Prisskillnad per månad', difference: 'Skillnad i kvot', unlimited: 'Utan abonnemangskvot (tekniska säkerhetsgränser kan gälla)', unknown: 'En eller flera efterfrågade priser saknas i den verifierade katalogen.', labels: ['AI-coach', 'Matskanning', 'Kroppsskanning', 'AI-Ögat', 'Vänchatt', 'Röstinmatning', 'Uppläsning', 'GPS', 'GPS Live', 'SOS', 'AI-Örat'] },
  en: { intro: 'Verified active catalog plans, not a statement about your own plan or purchase availability. Quotas are those in the app plan comparison.', missing: 'I cannot verify the requested plan information right now. I will not guess prices or quotas.', incomplete: 'Complete quotas are unavailable; I cannot compare them.', extra: 'Monthly price difference', difference: 'Quota difference', unlimited: 'No subscription quota (technical safety limits may apply)', unknown: 'One or more requested prices are absent from the verified catalog.', labels: ['AI coach', 'Food scan', 'Body scan', 'AI Eye', 'Friend chat', 'Voice input', 'Read aloud', 'GPS', 'GPS Live', 'SOS', 'AI Ear'] },
  es: { intro: 'Planes activos verificados del catálogo; no confirma tu plan ni la disponibilidad de compra. Las cuotas son las de la comparación de planes de la app.', missing: 'No puedo verificar el plan solicitado ahora. No inventaré precios ni cuotas.', incomplete: 'Faltan cuotas completas; no puedo compararlas.', extra: 'Diferencia de precio mensual', difference: 'Diferencia de cuota', unlimited: 'Sin cuota de suscripción (pueden aplicarse límites técnicos)', unknown: 'Uno o más precios solicitados no figuran en el catálogo verificado.', labels: ['Coach IA', 'Escaneo de alimentos', 'Escaneo corporal', 'Ojo IA', 'Chat con amigos', 'Entrada de voz', 'Lectura en voz alta', 'GPS', 'GPS Live', 'SOS', 'Oído IA'] },
  ar: { intro: 'خطط نشطة موثقة من الكتالوج، وليست تأكيدًا لخطتك أو لإمكانية الشراء. الحصص وفق مقارنة الخطط في التطبيق.', missing: 'لا أستطيع التحقق من بيانات الخطة المطلوبة الآن. لن أخمّن الأسعار أو الحصص.', incomplete: 'الحصص الكاملة غير متاحة؛ لا يمكنني مقارنتها.', extra: 'فرق السعر الشهري', difference: 'فرق الحصة', unlimited: 'دون حصة اشتراك (قد تنطبق حدود أمان تقنية)', unknown: 'سعر واحد أو أكثر من الأسعار المطلوبة غير موجود في الكتالوج الموثق.', labels: ['مدرب الذكاء الاصطناعي', 'مسح الطعام', 'مسح الجسم', 'عين الذكاء الاصطناعي', 'دردشة الأصدقاء', 'الإدخال الصوتي', 'القراءة الصوتية', 'GPS', 'GPS Live', 'SOS', 'أذن الذكاء الاصطناعي'] },
}
const keys = ['ai_coach', 'food_scan', 'body_scan', 'ai_eye', 'friend_chat', 'voice_input', 'speech', 'gps', 'gps_live', 'sos', 'ai_ear']

function price(plan) {
  if (plan.complimentary && plan.priceText === 'Gratis') return 0
  const match = /^(\d+) kr\/mån$/.exec(plan.priceText || '')
  return match ? Number(match[1]) : null
}

// Read-only: exactly the data source used by /api/billing/plans. No model is
// allowed to invent plan differences or replace an unavailable catalog.
export async function answerPlanQuestion({ question, userId, language, reader = readPlanComparison }) {
  const words = copy[language.code] || copy.en
  const result = { ok: true, source: 'verified-plans', status: 'answered', language: copy[language.code] ? language : { code: 'en', direction: 'ltr', fallback: true }, featureIds: ['settings.plan'] }
  let catalog
  try { catalog = await reader(userId) } catch { /* unavailable facts stay unknown */ }
  const plans = (catalog?.plans || []).filter((plan) => price(plan) !== null)
  if (!plans.length) return { ...result, answer: words.missing }
  const requested = [...new Set((question.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map((value) => Number(value.replace(',', '.'))))]
  if (/gratis|free|gratuito|مجاني/iu.test(question)) requested.push(0)
  const all = /\b(?:alla|samtliga|all|todos)\b|جميع/iu.test(question)
  const selected = all || !requested.length ? plans : plans.filter((plan) => requested.includes(price(plan)))
  if (!selected.length) return { ...result, answer: words.missing }
  const label = (key) => words.labels[keys.indexOf(key)]
  const code = copy[language.code] ? language.code : 'en'
  const priceLabel = (amount, monthly = false) => ({
    sv: `${amount} kr${monthly ? '/månad' : ''}`,
    en: `${amount} Swedish kronor${monthly ? '/month' : ''}`,
    es: `${amount} coronas suecas${monthly ? '/mes' : ''}`,
    ar: `${amount} كرونة سويدية${monthly ? '/شهر' : ''}`,
  })[code]
  const summaryTitle = { sv: 'Skillnader', en: 'Differences', es: 'Diferencias', ar: 'الفروق' }[code]
  const lines = [words.intro, '']
  if (!all && requested.some((value) => !plans.some((plan) => price(plan) === value))) lines.push(words.unknown)
  for (const plan of selected) {
    const quotas = (plan.quotas || []).filter((row) => label(row.key) && Number.isInteger(row.limit) && row.limit >= 0)
    lines.push(`### ${priceLabel(price(plan), true)}`)
    if (plan.complete && quotas.length) lines.push(...quotas.map((row) => `- ${label(row.key)}: ${row.limit}`))
    else lines.push(words.incomplete)
    const unlimited = (plan.unlimited || []).map((row) => label(row.key)).filter(Boolean)
    if (plan.complete && unlimited.length) lines.push('', `${words.unlimited}:`, ...unlimited.map((name) => `- ${name}`))
    lines.push('')
  }
  if (selected.length === 2) {
    const [low, high] = [...selected].sort((a, b) => price(a) - price(b))
    lines.push(`### ${summaryTitle}`, `${words.extra}: ${priceLabel(price(high) - price(low))}.`, '')
    if (low.complete && high.complete) for (const row of high.quotas || []) {
      const before = low.quotas.find((item) => item.key === row.key)
      if (label(row.key) && Number.isInteger(before?.limit) && Number.isInteger(row.limit)) {
        const delta = row.limit - before.limit
        lines.push(`- ${label(row.key)}: ${before.limit} → ${row.limit} (${delta >= 0 ? '+' : ''}${delta})`)
      }
    }
  }
  return { ...result, answer: lines.join('\n') }
}
