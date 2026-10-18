const HOW_TO = /hur |how do|how can|what happens|cómo|como |كيف|ماذا يحدث/i
const PROBLEM = /fungerar inte|funkar inte|problem med|fel på|kan inte använda|kan inte logga|doesn.?t work|not working|problem with|cannot use|can't use|can't sign in|no funciona|problema con|لا يعمل|مشكلة في|لا أستطيع/iu
const RESOLVED = /fungerar det nu|är det (?:nu )?löst|is it fixed|does it work now|¿ya funciona|هل تم الحل/iu
const NEGATED = /inget problem|no problem|sin problema|لا توجد مشكلة|inte.{0,24}problem/iu

const FEATURES = Object.freeze({
  body: Object.freeze({ feature: 'body.scan', key: 'body_scan', knowledgeId: 'feature.body-scan', unit: 'requests' }),
  coach: Object.freeze({ feature: 'ai.text.request', key: 'ai_coach', knowledgeId: 'more.coach', unit: 'requests' }),
  food: Object.freeze({ feature: 'food.scan', key: 'food_scan', knowledgeId: 'more.nutrition', unit: 'requests' }),
})

const PROBES = Object.freeze([
  [/^(?:gäller det inloggningen|is it the sign-in|¿es el inicio de sesión|هل يخص تسجيل الدخول)\??$/iu, 'Jag kan inte logga in'],
  [/^(?:gäller det matscanningen|is it the food scan|¿es el escáner de comida|هل يخص مسح الطعام)\??$/iu, 'Matscanningen fungerar inte'],
  [/^(?:gäller det kroppsscanningen|is it the body scan|¿es el escáner corporal|هل يخص مسح الجسم)\??$/iu, 'Kroppsscanningen fungerar inte'],
  [/^(?:gäller det kameran|is it the camera|¿es la cámara|هل يخص الكاميرا)\??$/iu, 'Kameran fungerar inte'],
  [/^(?:gäller det mikrofonen|is it the microphone|¿es el micrófono|هل يخص الميكروفون)\??$/iu, 'Mikrofonen fungerar inte'],
  [/^(?:gäller det abonnemanget|is it the subscription|¿es la suscripción|هل يخص الاشتراك)\??$/iu, 'Abonnemanget fungerar inte'],
  [/^(?:gäller det betalningen|is it the payment|¿es el pago|هل يخص الدفع)\??$/iu, 'Betalningen fungerar inte'],
  [/^(?:gäller det ai-coachen|is it the ai coach|¿es el entrenador|هل يخص المدرب)\??$/iu, 'AI-coachen fungerar inte'],
])

export function troubleFeature(domain) {
  return FEATURES[domain] || null
}

export function troubleProbeSentence(question) {
  const text = String(question || '').trim()
  const match = PROBES.find(([pattern]) => pattern.test(text))
  return match ? match[1] : ''
}

export function detectTrouble(question) {
  const text = String(question || '')
  if (HOW_TO.test(text) || NEGATED.test(text)) return null
  const resolvedCheck = RESOLVED.test(text)
  const problem = PROBLEM.test(text)
  if (!problem && !resolvedCheck) return null
  const food = /matskann|matscan|food scan|skanna mat|escáner de alimentos|escanear comida|مسح الطعام|ماسح الطعام/i.test(text)
  const body = /kroppsscann|body scan|escáner corporal|مسح الجسم/i.test(text)
  const coach = /ai-?coach|coachen|\bcoach\b|entrenador|المدرب/i.test(text)
  const camera = /kamera|camera|cámara|camara|كاميرا/i.test(text)
  const microphone = /mikrofon|microphone|micrófono|microfono|ميكروفون/i.test(text)
  const login = /logga in|inlogg|sign in|login|iniciar sesión|تسجيل الدخول/i.test(text)
  const payment = /betal|payment|pago|دفع/i.test(text)
  const subscription = /abonnemang|prenumeration|subscription|suscripción|اشتراك/i.test(text)
  let domain = ''
  if (food) domain = 'food'
  else if (body) domain = 'body'
  else if (coach) domain = 'coach'
  else if (camera) domain = 'camera'
  else if (microphone) domain = 'microphone'
  else if (login) domain = 'login'
  else if (payment) domain = 'payment'
  else if (subscription) domain = 'subscription'
  else if (problem) domain = 'unknown'
  return {
    deviceBlocked: camera || microphone,
    domain,
    resolvedCheck,
  }
}

function pack(languageCode) {
  if (languageCode === 'sv') return {
    ask: 'Jag behöver veta vilket område som krånglar: inloggning, abonnemang, betalning, AI-coach, matscanning, kroppsscanning, kamera eller mikrofon. Ingen diagnos är gjord och inget har ändrats.',
    camera: 'Kameradiagnos är blockerad. Servern kan inte läsa kamerabehörighet, bilder eller enhetsfel. Ingen behörighet kan ändras här. Inget har ändrats.',
    clear: 'Den verifierade kontrollen visar inget kvarvarande hinder',
    excluded: 'ingår inte i den verifierade planen. Behörigheten kan inte ändras här.',
    loginBlocked: 'Ett nytt bekräftelsemejl är blockerat eftersom inget befintligt API skickar det utan att exponera en token.',
    loginClear: 'Inget lösenordsfel kan verifieras. Det enda säkra steget är ett återställningsmejl till den verifierade adressen, och det skickas först när du bekräftar.',
    loginMissing: 'Inloggningen kan inte verifiera en e-postadress. Ingen återställning har skickats.',
    microphone: 'Mikrofondiagnos är blockerad. Servern kan inte läsa mikrofonbehörighet eller ljud. Ingen behörighet kan ändras här och mikrofonen startas inte. Inget har ändrats.',
    noSubscription: 'Ingen verifierad prenumeration hittades. En ny betalning kräver en namngiven befintlig plan och en separat bekräftelse. Ingen betalning har startats.',
    notSolved: 'Den verifierade kontrollen visar att problemet inte är löst.',
    paymentBlocked: 'Orsaken till en misslyckad betalning lagras inte. Ett nytt kortförsök är blockerat. Ingen betalning har startats.',
    quotaBlocked: 'Kvoten kan inte återställas här.',
    quotaClear: 'Inget verifierat funktionsfel hittades.',
    stillThere: 'Om felet syns kvar kan du fortsätta med mänsklig support.',
    unchanged: 'Inget har ändrats.',
    unknownDevice: 'Kamera och mikrofon kan inte kontrolleras härifrån.',
    unverified: 'Jag kan inte verifiera uppgifterna, så jag gissar inte felet. Inget har ändrats.',
  }
  if (languageCode === 'es') return {
    ask: 'Necesito saber el área: inicio de sesión, suscripción, pago, entrenador, comida, cuerpo, cámara o micrófono. No se hizo ningún diagnóstico y no se ha cambiado nada.',
    camera: 'El diagnóstico de la cámara está bloqueado. El servidor no puede leer el permiso, las imágenes ni el fallo del dispositivo. No se ha cambiado nada.',
    clear: 'La comprobación verificada no muestra un obstáculo restante',
    excluded: 'no está incluida en el plan verificado. El permiso no se puede cambiar aquí.',
    loginBlocked: 'Un nuevo correo de confirmación está bloqueado porque no existe una API que lo envíe sin exponer un token.',
    loginClear: 'No se puede verificar un fallo de contraseña. El único paso seguro es un correo de restablecimiento a la dirección verificada, y solo se envía después de confirmar.',
    loginMissing: 'El inicio de sesión no puede verificar un correo. No se envió ningún restablecimiento.',
    microphone: 'El diagnóstico del micrófono está bloqueado. El servidor no puede leer el permiso ni el audio. El micrófono no se inicia. No se ha cambiado nada.',
    noSubscription: 'No se encontró una suscripción verificada. Un pago nuevo requiere un plan existente con nombre y una confirmación separada. No se inició ningún pago.',
    notSolved: 'La comprobación verificada muestra que el problema no está resuelto.',
    paymentBlocked: 'La causa de un pago fallido no está almacenada. Un nuevo intento con tarjeta está bloqueado. No se inició ningún pago.',
    quotaBlocked: 'La cuota no se puede restablecer aquí.',
    quotaClear: 'No se encontró un fallo verificado de la función.',
    stillThere: 'Si el fallo sigue visible, puedes continuar con asistencia humana.',
    unchanged: 'No se ha cambiado nada.',
    unknownDevice: 'La cámara y el micrófono no se pueden comprobar desde aquí.',
    unverified: 'No puedo verificar los datos, así que no adivino el fallo. No se ha cambiado nada.',
  }
  if (languageCode === 'ar') return {
    ask: 'أحتاج إلى معرفة المجال: الدخول أو الاشتراك أو الدفع أو المدرب أو الطعام أو الجسم أو الكاميرا أو الميكروفون. لم يتم تشخيص ولن يتم تغيير أي شيء.',
    camera: 'تشخيص الكاميرا محظور. لا يستطيع الخادم قراءة الإذن أو الصور أو عطل الجهاز. لم يتم تغيير أي شيء.',
    clear: 'لا يظهر الفحص الذي تم التحقق منه عائقا متبقيا',
    excluded: 'غير مشمولة في الخطة التي تم التحقق منها. لا يمكن تغيير الإذن هنا.',
    loginBlocked: 'رسالة تأكيد جديدة محظورة لأنه لا توجد واجهة ترسلها دون كشف رمز.',
    loginClear: 'لا يمكن التحقق من عطل كلمة المرور. الخطوة الآمنة الوحيدة هي رسالة إعادة تعيين إلى العنوان الذي تم التحقق منه، ولا تُرسل إلا بعد التأكيد.',
    loginMissing: 'لا يمكن التحقق من بريد لتسجيل الدخول. لم تُرسل إعادة تعيين.',
    microphone: 'تشخيص الميكروفون محظور. لا يستطيع الخادم قراءة الإذن أو الصوت. لا يتم تشغيل الميكروفون. لم يتم تغيير أي شيء.',
    noSubscription: 'لم يتم العثور على اشتراك تم التحقق منه. الدفع الجديد يحتاج إلى خطة موجودة مسماة وتأكيد منفصل. لم يبدأ أي دفع.',
    notSolved: 'يظهر الفحص الذي تم التحقق منه أن المشكلة لم تُحل.',
    paymentBlocked: 'سبب فشل الدفع غير مخزن. محاولة البطاقة الجديدة محظورة. لم يبدأ أي دفع.',
    quotaBlocked: 'لا يمكن إعادة تعيين الحصة هنا.',
    quotaClear: 'لم يتم العثور على عطل وظيفة تم التحقق منه.',
    stillThere: 'إذا بقي العطل ظاهرا يمكنك المتابعة مع الدعم البشري.',
    unchanged: 'لم يتم تغيير أي شيء.',
    unknownDevice: 'لا يمكن فحص الكاميرا والميكروفون من هنا.',
    unverified: 'لا أستطيع التحقق من البيانات، لذلك لا أخمن العطل. لم يتم تغيير أي شيء.',
  }
  return {
    ask: 'I need the area: sign-in, subscription, payment, AI coach, food scan, body scan, camera or microphone. No diagnosis was made and nothing was changed.',
    camera: 'Camera diagnosis is blocked. The server cannot read the permission, images or a device fault. No permission can be changed here. Nothing was changed.',
    clear: 'The verified check shows no remaining blocker',
    excluded: 'is not included in the verified plan. The permission cannot be changed here.',
    loginBlocked: 'A new confirmation email is blocked because no existing API sends one without exposing a token.',
    loginClear: 'No password fault can be verified. The only safe step is a reset email to the verified address, and it is sent only after you confirm.',
    loginMissing: 'Sign-in cannot verify an email address. No reset was sent.',
    microphone: 'Microphone diagnosis is blocked. The server cannot read the permission or audio. The microphone is not started. Nothing was changed.',
    noSubscription: 'No verified subscription was found. A new payment requires a named existing plan and a separate confirmation. No payment has been started.',
    notSolved: 'The verified check shows that the problem is not solved.',
    paymentBlocked: 'The reason for a failed payment is not stored. A new card attempt is blocked. No payment has been started.',
    quotaBlocked: 'The quota cannot be reset here.',
    quotaClear: 'No verified feature fault was found.',
    stillThere: 'If the fault is still visible, you can continue with human support.',
    unchanged: 'Nothing was changed.',
    unknownDevice: 'The camera and microphone cannot be checked from here.',
    unverified: 'I cannot verify the details, so I will not guess the fault. Nothing was changed.',
  }
}

function result(answer, { confirmation = null, followUps = [], handoff = true } = {}) {
  return { answer, confirmation, followUps, handoff }
}

function label(domain, swedish) {
  const labels = {
    body: swedish ? 'kroppsscanning' : 'body scan',
    coach: swedish ? 'AI-coach' : 'AI coach',
    food: swedish ? 'matscanning' : 'food scan',
  }
  return labels[domain] || (swedish ? 'funktionen' : 'the feature')
}

function openSubscription(subscription) {
  return Boolean(subscription && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(subscription.status))
}

function withResolved(copy, resolvedCheck, answer, solved) {
  if (!resolvedCheck) return answer
  return solved ? `${copy.clear}. ${answer}` : `${copy.notSolved} ${answer}`
}

export function renderTroubleAnswer({ account = null, context = null, languageCode = 'sv', selection = {} } = {}) {
  const copy = pack(languageCode)
  const swedish = languageCode === 'sv'
  const domain = selection.troubleDomain || ''
  const resolvedCheck = selection.resolvedCheck === true
  const followFeature = swedish
    ? ['Gäller det matscanningen?', 'Gäller det kameran?']
    : languageCode === 'es'
      ? ['¿Es el escáner de comida?', '¿Es la cámara?']
      : languageCode === 'ar'
        ? ['هل يخص مسح الطعام؟', 'هل يخص الكاميرا؟']
        : ['Is it the food scan?', 'Is it the camera?']
  if (!domain || domain === 'unknown') {
    return result(copy.ask, { followUps: followFeature })
  }
  if (domain === 'camera') return result(withResolved(copy, resolvedCheck, copy.camera, false), { followUps: followFeature })
  if (domain === 'microphone') return result(withResolved(copy, resolvedCheck, copy.microphone, false))
  if (domain === 'login') {
    const email = account?.email || ''
    if (!email) return result(copy.loginMissing)
    if (account?.emailConfirmed !== true) {
      const answer = swedish
        ? `Verifierad e-post är ${email} och den är obekräftad. ${copy.loginBlocked} ${copy.unchanged}`
        : `The verified email is ${email} and it is unconfirmed. ${copy.loginBlocked} ${copy.unchanged}`
      return result(withResolved(copy, resolvedCheck, answer, false))
    }
    const answer = swedish
      ? `Verifierad e-post är ${email} och den är bekräftad. ${copy.loginClear} ${copy.unchanged}`
      : `The verified email is ${email} and it is confirmed. ${copy.loginClear} ${copy.unchanged}`
    return result(withResolved(copy, resolvedCheck, answer, false), { confirmation: { action: 'password_reset' } })
  }
  if (!context?.available) return result(copy.unverified)
  if (domain === 'subscription' || domain === 'payment') {
    const subscription = context.subscription
    const status = context.payment?.status || subscription?.status || ''
    if (!subscription) return result(withResolved(copy, resolvedCheck, copy.noSubscription, false))
    if (subscription.cancel_at_period_end && openSubscription(subscription)) {
      const answer = swedish
        ? `Verifierad status är ${status}. Uppsägning är schemalagd till ${subscription.current_period_end || 'periodens slut'}. Den tas bort först när du bekräftar. Ingen betalning har startats.`
        : `The verified status is ${status}. Cancellation is scheduled until ${subscription.current_period_end || 'the period end'}. It is removed only after you confirm. No payment has been started.`
      return result(withResolved(copy, resolvedCheck, answer, false), { confirmation: { action: 'undo_cancel' } })
    }
    if (['PAST_DUE', 'PAUSED', 'EXPIRED'].includes(status)) {
      const answer = swedish
        ? `Verifierad betalningsstatus är ${status}. ${copy.paymentBlocked}`
        : `The verified payment status is ${status}. ${copy.paymentBlocked}`
      return result(withResolved(copy, resolvedCheck, answer, false))
    }
    if (domain === 'payment') {
      const answer = swedish
        ? `Verifierad betalningsstatus är ${status || 'okänd'}. ${copy.quotaClear} ${copy.paymentBlocked} ${copy.stillThere} ${copy.unchanged}`
        : `The verified payment status is ${status || 'unknown'}. ${copy.quotaClear} ${copy.paymentBlocked} ${copy.stillThere} ${copy.unchanged}`
      return result(withResolved(copy, resolvedCheck, answer, status === 'ACTIVE'))
    }
    const answer = swedish
      ? `Verifierad status är ${status} för ${subscription.plan_id}. Inget verifierat abonnemangsfel hittades. ${copy.stillThere} ${copy.unchanged}`
      : `The verified status is ${status} for ${subscription.plan_id}. No verified subscription fault was found. ${copy.stillThere} ${copy.unchanged}`
    return result(withResolved(copy, resolvedCheck, answer, status === 'ACTIVE'))
  }

  const name = label(domain, swedish)
  const entitlement = (context.entitlements || []).find((row) => row.feature === FEATURES[domain]?.feature)
  if (context.entitlements && (!entitlement || entitlement.enabled === false)) {
    const answer = `${name} ${copy.excluded} ${copy.unchanged}`
    return result(withResolved(copy, resolvedCheck, answer, false))
  }
  const quota = context.quota
  if (quota && !quota.unlimited && quota.remaining === 0 && quota.limit != null) {
    const answer = swedish
      ? `Kvoten för ${name} är slut. Du har använt ${quota.used} av ${quota.limit}. ${copy.quotaBlocked} ${copy.unchanged}`
      : `The quota for ${name} is used up. You have used ${quota.used} of ${quota.limit}. ${copy.quotaBlocked} ${copy.unchanged}`
    return result(withResolved(copy, resolvedCheck, answer, false))
  }
  const status = context.payment?.status || context.subscription?.status
  if (status === 'PAST_DUE' || status === 'PAUSED' || status === 'EXPIRED') {
    const answer = swedish
      ? `Verifierad status ${status} kan påverka ${name}. ${copy.paymentBlocked}`
      : `Verified status ${status} can affect ${name}. ${copy.paymentBlocked}`
    return result(withResolved(copy, resolvedCheck, answer, false))
  }
  const remaining = quota && !quota.unlimited && quota.remaining != null
    ? (swedish ? ` ${quota.remaining} av ${quota.limit} återstår.` : ` ${quota.remaining} of ${quota.limit} remain.`)
    : ''
  const device = selection.deviceBlocked ? ` ${copy.camera}` : ` ${copy.unknownDevice}`
  const answer = `${copy.quotaClear}${remaining}${device} ${copy.stillThere} ${copy.unchanged}`
  return result(withResolved(copy, resolvedCheck, answer, true))
}
