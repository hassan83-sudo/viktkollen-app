const OPEN_STATUS = new Set(['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'])

export function caseControl(question) {
  const text = String(question || '').trim()
  if (/^(?:nej|avbryt|stop|no|cancela esto|لا|توقف)\??$/iu.test(text)) return 'abort'
  if (/^(?:ja|yes|sí|si|نعم)\??$/iu.test(text)) return 'unconfirmed'
  if (/^(?:fortsätt|samma problem|continue|same problem|continúa|el mismo problema|تابع|نفس المشكلة)\??$/iu.test(text)) return 'continue'
  return ''
}

export function assessActionOutcome({
  action = '',
  code = '',
  ok = false,
  planId = '',
  subscription = null,
} = {}) {
  if (ok !== true) {
    const blocked = ['ACCOUNT_DELETE_BLOCKED', 'CHECKOUT_UNAVAILABLE', 'CONFIRMATION_REQUIRED', 'PROVIDER_NOT_CONFIGURED'].includes(code)
    return { outcome: blocked ? 'blocked' : 'failed', resolved: false }
  }
  if (action === 'password_reset' || action === 'hosted_checkout') {
    return { outcome: 'pending', resolved: false }
  }
  if (action === 'delete_account') {
    return code === 'ACCOUNT_DELETED'
      ? { outcome: 'verified', resolved: true }
      : { outcome: 'blocked', resolved: false }
  }
  if (!subscription) return { outcome: 'pending', resolved: false }
  if (action === 'undo_cancel') {
    const cleared = OPEN_STATUS.has(subscription.status) && subscription.cancel_at_period_end === false
    return cleared ? { outcome: 'verified', resolved: true } : { outcome: 'pending', resolved: false }
  }
  if (action === 'schedule_cancel') {
    return subscription.cancel_at_period_end === true
      ? { outcome: 'verified', resolved: true }
      : { outcome: 'pending', resolved: false }
  }
  if (action === 'plan_change') {
    return planId && subscription.pending_plan_id === planId
      ? { outcome: 'verified', resolved: true }
      : { outcome: 'pending', resolved: false }
  }
  return { outcome: 'failed', resolved: false }
}

const controlCopy = {
  sv: {
    abort: 'Åtgärden är avbruten. Inget har ändrats och ärendet är inte löst.',
    follow: 'Fungerar det nu?',
    unconfirmed: 'Ett ja i chatten bekräftar inte åtgärden. Använd knappen. Inget har ändrats och ärendet är inte löst.',
  },
  en: {
    abort: 'The action is cancelled. Nothing was changed and the case is not solved.',
    follow: 'Does it work now?',
    unconfirmed: 'A yes in the chat does not confirm the action. Use the button. Nothing was changed and the case is not solved.',
  },
  es: {
    abort: 'La acción quedó cancelada. No se ha cambiado nada y el caso no está resuelto.',
    follow: '¿Ya funciona?',
    unconfirmed: 'Un sí en el chat no confirma la acción. Usa el botón. No se ha cambiado nada y el caso no está resuelto.',
  },
  ar: {
    abort: 'تم إيقاف الإجراء. لم يتم تغيير أي شيء ولم يتم حل الطلب.',
    follow: 'هل تم الحل؟',
    unconfirmed: 'كلمة نعم في المحادثة لا تؤكد الإجراء. استخدم الزر. لم يتم تغيير أي شيء ولم يتم حل الطلب.',
  },
}

export function renderCaseControl({ control = '', languageCode = 'sv' } = {}) {
  const copy = controlCopy[languageCode] || controlCopy.en
  return {
    answer: control === 'abort' ? copy.abort : copy.unconfirmed,
    confirmation: null,
    followUps: [copy.follow],
    handoff: true,
  }
}
