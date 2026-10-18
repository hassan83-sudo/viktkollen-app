import { selectCustomerContext } from './customerContext.js'
import { caseControl } from './caseOutcome.js'
import { troubleProbeSentence } from './troubleshooting.js'

function withoutWrites(selection) {
  return {
    ...selection,
    accountRead: false,
    cancel: false,
    deleteAccount: false,
    deleteHelp: false,
    direct: true,
    emailChange: false,
    focus: 'troubleshoot',
    hostedCheckout: false,
    passwordHelp: false,
    passwordReset: false,
    personal: true,
    planChange: false,
    planId: '',
    profileChange: false,
    receiptRequest: false,
    refundRequest: false,
    secretRefused: false,
    transactionRequest: false,
    trouble: true,
    undoCancel: false,
  }
}

function canContinue(prior) {
  return Boolean(prior?.personal) && !prior.secretRefused && !prior.emailChange && !prior.profileChange && !prior.deleteAccount
}

export function selectCustomerConversation(messages) {
  const latest = messages.at(-1)?.content || ''
  const current = selectCustomerContext(latest)
  const previous = messages.slice(0, -1).filter((m) => m.role === 'user').at(-1)
  const prior = previous ? selectCustomerContext(previous.content) : null
  const safePrior = prior?.trouble && !prior.cancel && !prior.deleteAccount && !prior.passwordReset && !prior.planChange && !prior.hostedCheckout && !prior.undoCancel
  const control = caseControl(latest)
  if (control === 'continue' && canContinue(prior) && !current.cancel && !current.deleteAccount && !current.passwordReset && !current.planChange && !current.hostedCheckout) {
    return { ...prior, caseControl: '', direct: true, personal: true }
  }
  if ((control === 'abort' || control === 'unconfirmed') && canContinue(prior)) {
    return { ...withoutWrites(prior), caseControl: control }
  }
  if (safePrior && current.resolvedCheck && !current.troubleDomain) {
    return { ...withoutWrites(prior), caseControl: '', resolvedCheck: true }
  }
  const probe = troubleProbeSentence(latest)
  if (safePrior && probe && !current.trouble) return selectCustomerContext(probe)
  // Only explicit conversational references inherit customer context. Never infer a destructive action from history.
  if (!/^(och |and |what about |when |explain|förklara|hur mycket|y |cuándo|explica|و|متى|اشرح)/iu.test(latest.trim()) || current.cancel || current.undoCancel || current.planChange || current.hostedCheckout || current.refundRequest || current.receiptRequest || current.transactionRequest || current.deleteAccount || current.passwordReset || current.emailChange || current.profileChange || current.secretRefused || (current.personal && current.feature)) return current
  if (!previous) return current
  if (!prior?.personal || prior.cancel || prior.undoCancel || prior.planChange || prior.hostedCheckout || prior.refundRequest || prior.deleteAccount || prior.passwordReset || prior.emailChange || prior.profileChange || prior.secretRefused || prior.focus === 'login') return current
  const selected = current.personal ? current : selectCustomerContext(`${latest} ${/اشتراك|حساب|خطة|دفع|اشرح/iu.test(latest) ? 'اشتراكي' : /cuándo|explica|^y /iu.test(latest) ? 'mi suscripción' : 'my subscription'}`)
  return {
    ...prior, ...selected, personal: true, accountRead: false, cancel: false, deleteAccount: false, deleteHelp: false, emailChange: false, hostedCheckout: false, passwordHelp: false, passwordReset: false, planChange: false, planId: '', profileChange: false, receiptRequest: false, refundRequest: false, secretRefused: false, transactionRequest: false, undoCancel: false,
    feature: selected.feature || prior.feature,
    focus: selected.focus || prior.focus,
    slices: [...new Set([...prior.slices, ...selected.slices])],
  }
}
