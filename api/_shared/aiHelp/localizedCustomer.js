import { loginGuidance, troubleshootingLine } from '../../../src/features/aiHelp/launchGuidance.js'

// Deterministic customer facts for launch languages; no model or unverified facts are required.
const text = {
  es: {
    unknown: 'No puedo verificar los datos de la cuenta ahora. No se ha cambiado nada.',
    subscription: 'Suscripción verificada', status: 'Estado', price: 'Precio por período', end: 'Fin del período actual',
    remaining: 'Disponible', used: 'Usado', limit: 'Límite', unlimited: 'Sin límite', unavailable: 'No disponible',
    payment: 'Estado del pago', reason: 'No se conoce la causa de un pago fallido.', grace: 'Período de gracia hasta',
    blocked: 'La función no está incluida en tu plan.', exhausted: 'La cuota está agotada.', clear: 'No se encontró un fallo verificado. Revisa los permisos de la función en la aplicación.',
    login: loginGuidance('es'),
    none: 'No hay una suscripción abierta para cancelar. No se ha cambiado nada.', scheduled: 'La cancelación ya está programada para el final del período.',
    offer: 'La cancelación solo se realizará al pulsar Confirmar cancelación. La suscripción seguirá hasta el final del período. No se ha cambiado nada.',
  },
  ar: {
    unknown: 'لا أستطيع التحقق من بيانات الحساب الآن. لم يتم تغيير أي شيء.',
    subscription: 'الاشتراك الذي تم التحقق منه', status: 'الحالة', price: 'السعر لكل فترة', end: 'نهاية الفترة الحالية',
    remaining: 'المتبقي', used: 'المستخدم', limit: 'الحد', unlimited: 'غير محدود', unavailable: 'غير متاح',
    payment: 'حالة الدفع', reason: 'سبب فشل الدفع غير متاح.', grace: 'فترة السماح حتى',
    blocked: 'الميزة غير مشمولة في خطتك.', exhausted: 'تم استنفاد الحصة.', clear: 'لم يتم العثور على عطل مؤكد. تحقق من أذونات الميزة في التطبيق.',
    login: loginGuidance('ar'),
    none: 'لا يوجد اشتراك مفتوح للإلغاء. لم يتم تغيير أي شيء.', scheduled: 'الإلغاء مجدول بالفعل لنهاية الفترة.',
    offer: 'لن يتم الإلغاء إلا بعد الضغط على تأكيد إلغاء الاشتراك. يستمر الاشتراك حتى نهاية الفترة. لم يتم تغيير أي شيء.',
  },
}
export function localizedCancel(context, language) {
  const t = text[language]
  if (!t) return null
  if (!context?.available) return { answer: t.unknown, confirmation: null }
  const s = context.subscription
  if (!s || !['TRIALING','ACTIVE','PAST_DUE','PAUSED'].includes(s.status)) return { answer: t.none, confirmation: null }
  if (s.cancel_at_period_end) return { answer: `${t.scheduled} ${s.current_period_end || ''}`, confirmation: null }
  return { answer: `${t.offer} ${s.current_period_end ? `${t.end}: ${s.current_period_end}.` : ''}`, confirmation: { action: 'schedule_cancel' } }
}
export function localizedCustomer(context, selection, language) {
  const t = text[language]
  if (!t) return null
  if (!context?.available) return t.unknown
  const focus = selection?.focus
  if (focus === 'login') return t.login
  if (focus === 'cancel') return localizedCancel(context, language).answer
  if (focus === 'payment') {
    const p = context.payment
    return `${t.payment}: ${p?.status || t.unavailable}. ${p?.past_due_grace_until ? `${t.grace}: ${p.past_due_grace_until}.` : ''} ${t.reason}`
  }
  if (focus === 'usage') {
    const q = context.quota
    if (q) return q.unlimited ? t.unlimited : `${t.used}: ${q.used ?? t.unavailable}. ${t.limit}: ${q.limit ?? t.unavailable}. ${t.remaining}: ${q.remaining ?? t.unavailable}.`
    return (context.usage?.quotas || []).map((q) => `${q.key}: ${t.used} ${q.used}, ${t.limit} ${q.limit}, ${t.remaining} ${q.remaining}.`).concat((context.usage?.unlimited || []).map((key) => `${key}: ${t.unlimited}.`)).join(' ') || t.unavailable
  }
  if (focus === 'entitlements') return (context.entitlements || []).map((e) => `${e.feature}: ${!e.enabled ? t.blocked : e.limit_kind === 'UNLIMITED' ? t.unlimited : e.limit_value ?? t.unavailable}.`).join(' ') || t.unavailable
  if (focus === 'access') {
    const e = (context.entitlements || []).find((row) => row.feature === selection?.feature?.feature)
    if (context.entitlements && selection?.feature && !e || e?.enabled === false) return t.blocked
    if (context.quota?.remaining === 0 && !context.quota.unlimited) return t.exhausted
    const s = context.payment?.status || context.subscription?.status
    if (['PAST_DUE','PAUSED','EXPIRED'].includes(s)) return `${t.status}: ${s}. ${t.reason}`
    return `${t.clear} ${troubleshootingLine(language)}`
  }
  const s = context.subscription
  const p = context.plan
  const parts = []
  if (s) parts.push(`${t.subscription}: ${s.plan_id}. ${t.status}: ${s.status}.`)
  if (p && Number.isInteger(p.price_minor) && p.currency) parts.push(`${t.price}: ${new Intl.NumberFormat(language, { style: 'currency', currency: p.currency }).format(p.price_minor / 100)}.`)
  if (s?.current_period_end) parts.push(`${t.end}: ${s.current_period_end}.`)
  if (s?.cancel_at_period_end) parts.push(t.scheduled)
  return parts.join(' ') || t.unavailable
}
