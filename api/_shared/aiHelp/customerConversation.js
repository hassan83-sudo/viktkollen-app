import { selectCustomerContext } from './customerContext.js'

export function selectCustomerConversation(messages) {
  const latest = messages.at(-1)?.content || ''
  const current = selectCustomerContext(latest)
  // Only explicit conversational references inherit customer context. Never infer a destructive action from history.
  if (!/^(och |and |what about |when |explain|förklara|hur mycket|y |cuándo|explica|و|متى|اشرح)/iu.test(latest.trim()) || current.cancel || current.undoCancel || current.planChange || current.hostedCheckout || current.refundRequest || current.receiptRequest || current.transactionRequest || (current.personal && current.feature)) return current
  const previous = messages.slice(0, -1).filter((m) => m.role === 'user').at(-1)
  if (!previous) return current
  const prior = selectCustomerContext(previous.content)
  if (!prior.personal || prior.cancel || prior.undoCancel || prior.planChange || prior.hostedCheckout || prior.refundRequest || prior.focus === 'login') return current
  const selected = current.personal ? current : selectCustomerContext(`${latest} ${/اشتراك|حساب|خطة|دفع|اشرح/iu.test(latest) ? 'اشتراكي' : /cuándo|explica|^y /iu.test(latest) ? 'mi suscripción' : 'my subscription'}`)
  return {
    ...prior, ...selected, personal: true, cancel: false, hostedCheckout: false, planChange: false, planId: '', receiptRequest: false, refundRequest: false, transactionRequest: false, undoCancel: false,
    feature: selected.feature || prior.feature,
    focus: selected.focus || prior.focus,
    slices: [...new Set([...prior.slices, ...selected.slices])],
  }
}
