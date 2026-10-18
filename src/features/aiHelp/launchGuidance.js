import { normalizeLanguageCode } from '../../i18n/languages.js'
import { getKnowledgeEntry } from './knowledgeCatalog.js'

const languages = {
  svenska: 'sv',
  swedish: 'sv',
  sueco: 'sv',
  engelska: 'en',
  english: 'en',
  inglés: 'en',
  ingles: 'en',
  arabiska: 'ar',
  arabic: 'ar',
  árabe: 'ar',
  arabe: 'ar',
  spanska: 'es',
  spanish: 'es',
  español: 'es',
  espanol: 'es',
}

const login = {
  sv: 'Jag ändrar inte kontot. Kontrollera e-postadressen och använd återställning av lösenord på inloggningssidan. Skriv inte lösenordet här.',
  en: 'I do not change the account. Check the email address and use password reset on the sign-in page. Do not type the password here.',
  es: 'No cambio la cuenta. Comprueba el correo y usa la recuperación de contraseña en la página de inicio de sesión. No escribas la contraseña aquí.',
  ar: 'لا أغيّر الحساب. تحقق من البريد واستخدم استعادة كلمة المرور في صفحة تسجيل الدخول. لا تكتب كلمة المرور هنا.',
}

const checks = {
  sv: 'Kontrollera att du är inloggad. Om funktionen använder kamera eller mikrofon, tillåt den i webbläsaren. Inget konto, abonnemang eller någon betalning har ändrats.',
  en: 'Check that you are signed in. If the feature uses the camera or microphone, allow it in the browser. No account, subscription or payment was changed.',
  es: 'Comprueba que has iniciado sesión. Si la función usa la cámara o el micrófono, permítelo en el navegador. No se ha cambiado ninguna cuenta, suscripción ni pago.',
  ar: 'تحقق من أنك مسجّل الدخول. إذا كانت الميزة تستخدم الكاميرا أو الميكروفون، اسمح بذلك في المتصفح. لم يتم تغيير أي حساب أو اشتراك أو دفعة.',
}

const followUps = {
  sv: {
    login: ['Hur återställer jag lösenordet utan att skriva det här?', 'Vad är min betalningsstatus?'],
    access: ['Vad är min betalningsstatus?', 'Var finns funktionen?'],
    payment: ['Vad är mitt abonnemang?', 'När slutar den här perioden?'],
    subscription: ['Vad är betalningsstatus?', 'När förnyas abonnemanget?'],
    default: ['Hur fungerar den här funktionen?', 'Vad är mitt abonnemang?'],
  },
  en: {
    login: ['How do I reset the password without typing it here?', 'What is my payment status?'],
    access: ['What is my payment status?', 'Where is the feature?'],
    payment: ['What is my subscription?', 'When does this period end?'],
    subscription: ['What is the payment status?', 'When does the subscription renew?'],
    default: ['How does this feature work?', 'What is my subscription?'],
  },
  es: {
    login: ['¿Cómo restablezco la contraseña sin escribirla aquí?', '¿Cuál es mi estado de pago?'],
    access: ['¿Cuál es mi estado de pago?', '¿Dónde está la función?'],
    payment: ['¿Cuál es mi suscripción?', '¿Cuándo termina este período?'],
    subscription: ['¿Cuál es el estado del pago?', '¿Cuándo se renueva la suscripción?'],
    default: ['¿Cómo funciona esta función?', '¿Cuál es mi suscripción?'],
  },
  ar: {
    login: ['كيف أستعيد كلمة المرور دون كتابتها هنا؟', 'ما حالة الدفع؟'],
    access: ['ما حالة الدفع؟', 'أين توجد الميزة؟'],
    payment: ['ما هو اشتراكي؟', 'متى تنتهي هذه الفترة؟'],
    subscription: ['ما حالة الدفع؟', 'متى يتجدد الاشتراك؟'],
    default: ['كيف تعمل هذه الميزة؟', 'ما هو اشتراكي؟'],
  },
}

function language(languageCode) {
  const code = normalizeLanguageCode(languageCode)
  return followUps[code] ? code : 'en'
}

export function loginGuidance(languageCode) {
  return login[language(languageCode)]
}

export function troubleshootingLine(languageCode) {
  return checks[language(languageCode)]
}

export function featureSteps(knowledgeId) {
  const entry = knowledgeId ? getKnowledgeEntry(knowledgeId) : null
  return entry?.steps?.length ? entry.steps.join(' ') : ''
}

export function followUpsFor(focus, languageCode) {
  const pack = followUps[language(languageCode)]
  return pack[focus] || pack.default
}

export function requestedLanguageSwitch(text) {
  const value = String(text || '').trim()
  const match = value.match(/^(?:byt|ändra|välj) språk(?:et)? till ([a-zåäöéí]+)$/iu)
    || value.match(/^(?:switch|change) language to ([a-z]+)$/iu)
    || value.match(/^(?:cambiar|cambia) (?:el )?idioma a ([a-záéíóúñåäö]+)$/iu)
    || value.match(/^(?:غيّر|غير) اللغة إلى (العربية|الإنجليزية|السويدية|الإسبانية)$/u)
  if (!match) return null
  const word = match[1].toLowerCase()
  const arabic = { 'العربية': 'ar', 'الإنجليزية': 'en', 'السويدية': 'sv', 'الإسبانية': 'es' }
  return languages[word] || arabic[match[1]] || null
}
