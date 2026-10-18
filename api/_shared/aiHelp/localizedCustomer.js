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
    undoOffer: 'La cancelación programada se retira solo al pulsar Confirmar reactivación. No se inicia un pago nuevo. No se ha cambiado nada.',
    undoNone: 'No hay una cancelación programada para deshacer.',
    planOffer: 'El cambio de plan solo se realiza al pulsar Confirmar cambio de plan. Empieza en el siguiente período y el plan se comprueba entonces. No se ha iniciado ningún pago y no se ha cambiado nada.',
    planSame: 'Ese ya es tu plan verificado. No se ha cambiado nada y no se ha iniciado ningún pago.',
    planMissing: 'Indica un plan existente para cambiar. No se ha iniciado ningún pago y no se ha cambiado nada.',
    unchanged: 'No se ha cambiado nada y no se ha iniciado ningún pago.',
    refundBlocked: 'El reembolso está bloqueado. La facturación existente no reembolsa y SumUp no tiene una llamada de reembolso. No se ha cambiado nada.',
    receiptBlocked: 'No se puede obtener un recibo.',
    transactionsBlocked: 'No se pueden listar las transacciones individuales.',
    hostedBlocked: 'Un nuevo intento con tarjeta está bloqueado. El chat no puede cobrar un instrumento guardado ni crear un segundo cobro.',
    hostedMissing: 'Indica un plan de pago existente para un nuevo intento.',
    hostedOffer: 'Un nuevo intento abre la página de pago de SumUp solo después de confirmar. Aquí no se escribe el número de tarjeta.',
    paymentNotStarted: 'No se ha iniciado ningún pago.',
    followUp: 'El problema de pago no resuelto puede continuar con asistencia humana. No se ha creado una solicitud automáticamente.',
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
    undoOffer: 'يُزال الإلغاء المجدول فقط بعد الضغط على تأكيد إعادة التفعيل. لا يبدأ دفع جديد. لم يتم تغيير أي شيء.',
    undoNone: 'لا يوجد إلغاء مجدول للتراجع عنه.',
    planOffer: 'لا يتم تغيير الخطة إلا بعد الضغط على تأكيد تغيير الخطة. يبدأ في الفترة التالية ويتم التحقق من الخطة حينها. لم يبدأ أي دفع ولم يتم تغيير أي شيء.',
    planSame: 'هذه هي خطتك التي تم التحقق منها بالفعل. لم يتم تغيير أي شيء ولم يبدأ أي دفع.',
    planMissing: 'اذكر خطة موجودة للتغيير. لم يبدأ أي دفع ولم يتم تغيير أي شيء.',
    unchanged: 'لم يتم تغيير أي شيء ولم يبدأ أي دفع.',
    refundBlocked: 'الاسترداد محظور. الفوترة الحالية لا تجري استردادًا ولا يملك تكامل SumUp استدعاء استرداد. لم يتم تغيير أي شيء.',
    receiptBlocked: 'لا يمكن جلب إيصال.',
    transactionsBlocked: 'لا يمكن عرض المعاملات الفردية.',
    hostedBlocked: 'محاولة البطاقة الجديدة محظورة. لا يمكن للدردشة خصم وسيلة دفع محفوظة ولا إنشاء خصم ثان.',
    hostedMissing: 'اذكر خطة مدفوعة موجودة لمحاولة جديدة.',
    hostedOffer: 'تفتح محاولة الدفع الجديدة صفحة SumUp فقط بعد التأكيد. لا يُكتب رقم البطاقة هنا.',
    paymentNotStarted: 'لم يبدأ أي دفع.',
    followUp: 'يمكن متابعة مشكلة الدفع غير المحلولة مع الدعم البشري. لم يتم إنشاء طلب تلقائيًا.',
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

export function localizedUndoCancel(context, language) {
  const t = text[language]
  if (!t) return null
  if (!context?.available) return { answer: t.unknown, confirmation: null }
  const s = context.subscription
  const open = s && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(s.status)
  if (!open || !s.cancel_at_period_end) {
    return { answer: `${t.undoNone} ${t.status}: ${s?.status || t.unavailable}. ${t.unchanged}`, confirmation: null }
  }
  return { answer: `${t.undoOffer} ${s.current_period_end ? `${t.end}: ${s.current_period_end}.` : ''}`, confirmation: { action: 'undo_cancel' } }
}

export function localizedPlanChange(context, language, planId) {
  const t = text[language]
  if (!t) return null
  if (!context?.available) return { answer: `${t.unknown} ${t.unchanged}`, confirmation: null }
  const currentId = context.subscription?.plan_id || context.plan?.plan_id || ''
  const price = context.plan && Number.isInteger(context.plan.price_minor) && context.plan.currency
    ? new Intl.NumberFormat(language, { style: 'currency', currency: context.plan.currency }).format(context.plan.price_minor / 100)
    : ''
  if (!planId) {
    return { answer: `${t.planMissing} ${currentId}. ${price ? `${t.price}: ${price}.` : ''}`, confirmation: null }
  }
  if (planId === currentId) return { answer: t.planSame, confirmation: null }
  return { answer: `${t.planOffer} ${planId}.`, confirmation: { action: 'plan_change', planId } }
}

export function localizedPaymentLimit(kind, context, language, planId = '') {
  const t = text[language]
  if (!t) return null
  const status = context?.payment?.status || context?.subscription?.status || t.unavailable
  const end = context?.subscription?.current_period_end
  const safePlanId = planId || ''
  if (kind === 'refund') {
    return { answer: `${t.refundBlocked} ${t.status}: ${status}. ${t.followUp}`, confirmation: null }
  }
  if (kind === 'receipt') {
    const price = context?.plan && Number.isInteger(context.plan.price_minor) && context.plan.currency
      ? new Intl.NumberFormat(language, { style: 'currency', currency: context.plan.currency }).format(context.plan.price_minor / 100)
      : ''
    return {
      answer: `${t.receiptBlocked} ${price ? `${t.price}: ${price}.` : ''} ${t.status}: ${status}.${end ? ` ${t.end}: ${end}.` : ''} ${t.followUp}`,
      confirmation: null,
    }
  }
  if (kind === 'transactions') {
    return {
      answer: `${t.transactionsBlocked} ${t.status}: ${status}.${end ? ` ${t.end}: ${end}.` : ''} ${t.reason} ${t.followUp}`,
      confirmation: null,
    }
  }
  if (kind === 'hosted') {
    const open = context?.subscription && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(context.subscription.status)
    if (!context?.available) return { answer: `${t.unknown} ${t.paymentNotStarted}`, confirmation: null }
    if (open) return { answer: `${t.hostedBlocked} ${t.status}: ${status}. ${t.reason} ${t.paymentNotStarted} ${t.followUp}`, confirmation: null }
    if (!safePlanId) return { answer: `${t.hostedMissing} ${t.paymentNotStarted}`, confirmation: null }
    return { answer: `${t.hostedOffer} ${safePlanId}. ${t.paymentNotStarted}`, confirmation: { action: 'hosted_checkout', planId: safePlanId } }
  }
  return null
}

const accountText = {
  es: {
    created: 'La cuenta se creó',
    confirmed: 'confirmado',
    unconfirmed: 'sin confirmar',
    deleteHelp: 'La eliminación requiere una confirmación separada y usa el flujo existente. No se ha eliminado nada.',
    deleteOffer: 'La cuenta se elimina con el flujo existente solo al pulsar Confirmar eliminación de cuenta. No se ha eliminado nada.',
    emailBlocked: 'El cambio de correo está bloqueado. No existe una API que verifique una dirección nueva. No se ha cambiado nada.',
    emailMissing: 'No se puede mostrar un correo verificado. No se ha cambiado nada.',
    passwordHelp: 'Pide un correo de restablecimiento a la dirección verificada. No escribas la contraseña aquí. No se ha cambiado nada.',
    passwordMissing: 'No hay un correo verificado para el restablecimiento. No se ha cambiado nada.',
    passwordOffer: 'El correo de restablecimiento se envía a la dirección verificada solo después de confirmar. No escribas la contraseña, un código ni un token aquí. No se ha cambiado nada.',
    profileBlocked: 'El cambio de nombre o perfil está bloqueado. No existe una API de cuenta segura para ese dato. No se ha cambiado nada.',
    read: 'El correo verificado es',
    secret: 'Las contraseñas, los códigos y los tokens no se guardan en el chat. Pide un correo de restablecimiento sin escribir la contraseña. No se ha cambiado nada.',
    unknownTime: 'en un momento desconocido',
  },
  ar: {
    created: 'أُنشئ الحساب',
    confirmed: 'مؤكد',
    unconfirmed: 'غير مؤكد',
    deleteHelp: 'حذف الحساب يحتاج إلى تأكيد منفصل ويستخدم مسار الحذف الحالي. لم يتم تنفيذ حذف.',
    deleteOffer: 'يُحذف الحساب عبر مسار الحذف الحالي فقط بعد الضغط على تأكيد حذف الحساب. لم يتم تنفيذ حذف.',
    emailBlocked: 'تغيير البريد محظور. لا توجد واجهة حالية تتحقق من عنوان جديد. لم يتم تغيير أي شيء.',
    emailMissing: 'لا يمكن عرض بريد تم التحقق منه. لم يتم تغيير أي شيء.',
    passwordHelp: 'اطلب رسالة إعادة تعيين إلى العنوان الذي تم التحقق منه. لا تكتب كلمة المرور هنا. لم يتم تغيير أي شيء.',
    passwordMissing: 'لا يوجد بريد تم التحقق منه لإعادة التعيين. لم يتم تغيير أي شيء.',
    passwordOffer: 'تُرسل رسالة إعادة التعيين إلى العنوان الذي تم التحقق منه فقط بعد التأكيد. لا تكتب كلمة المرور أو رمزًا أو رمز دخول هنا. لم يتم تغيير أي شيء.',
    profileBlocked: 'تغيير الاسم أو الملف الشخصي محظور. لا توجد واجهة حساب آمنة لتلك البيانات. لم يتم تغيير أي شيء.',
    read: 'البريد الذي تم التحقق منه هو',
    secret: 'لا تُحفظ كلمات المرور أو الرموز أو رموز الدخول في المحادثة. اطلب رسالة إعادة تعيين دون كتابة كلمة المرور. لم يتم تغيير أي شيء.',
    unknownTime: 'في وقت غير معروف',
  },
}

export function localizedAccount(kind, account, language) {
  const t = accountText[language]
  if (!t) return null
  const email = account?.email || ''
  const confirmed = account?.emailConfirmed === true
  const created = account?.createdAt || t.unknownTime
  if (kind === 'read') {
    if (!email) return { answer: t.emailMissing, confirmation: null }
    return {
      answer: `${t.read} ${email}. ${confirmed ? t.confirmed : t.unconfirmed}. ${t.created} ${created}.`,
      confirmation: null,
    }
  }
  if (kind === 'password-reset') {
    if (!email) return { answer: t.passwordMissing, confirmation: null }
    return { answer: t.passwordOffer, confirmation: { action: 'password_reset' } }
  }
  if (kind === 'password-help') return { answer: t.passwordHelp, confirmation: null }
  if (kind === 'delete-account') return { answer: t.deleteOffer, confirmation: { action: 'delete_account' } }
  if (kind === 'delete-help') return { answer: t.deleteHelp, confirmation: null }
  if (kind === 'email-change') return { answer: t.emailBlocked, confirmation: null }
  if (kind === 'profile-change') return { answer: t.profileBlocked, confirmation: null }
  return { answer: t.secret, confirmation: null }
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
    const usageText = q
      ? (q.unlimited ? t.unlimited : `${t.used}: ${q.used ?? t.unavailable}. ${t.limit}: ${q.limit ?? t.unavailable}. ${t.remaining}: ${q.remaining ?? t.unavailable}.`)
      : ((context.usage?.quotas || []).map((row) => `${row.key}: ${t.used} ${row.used}, ${t.limit} ${row.limit}, ${t.remaining} ${row.remaining}.`).concat((context.usage?.unlimited || []).map((key) => `${key}: ${t.unlimited}.`)).join(' ') || t.unavailable)
    if (!selection?.slices?.includes('plan')) return usageText
    const p = context.plan
    const price = p && Number.isInteger(p.price_minor) && p.currency
      ? `${t.price}: ${new Intl.NumberFormat(language, { style: 'currency', currency: p.currency }).format(p.price_minor / 100)}.`
      : ''
    return `${p?.plan_id ? `${t.subscription}: ${p.plan_id}.` : ''} ${price} ${usageText}`.trim()
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
