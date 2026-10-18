import { describe, expect, it, vi } from 'vitest'
import { directHelpDestination, isDirectNavigationRequest } from './navigationRequest.js'
import { sanitizeHelpTool, commitHelpSectionOpen } from './aiHelpTools.js'
import { answerAiHelpQuestion, answerIsAllowed } from '../../../api/_shared/aiHelp/service.js'
import { selectCustomerConversation } from '../../../api/_shared/aiHelp/customerConversation.js'
import { renderAccountAnswer, renderCancelOffer, renderHostedCheckoutOffer, renderPlanChangeOffer, renderRefundAnswer, renderUndoCancelOffer, renderVerifiedAnswer, selectCustomerContext, wantsScheduleCancel } from '../../../api/_shared/aiHelp/customerContext.js'
import { helpChrome } from './uiChrome.js'

describe('launch language navigation and customer conversations', () => {
  it.each([
    ['sv','Ta mig till matscanningen'], ['en','Take me to the food scanner'],
    ['es','Llévame al escáner de alimentos'], ['ar','خذني إلى ماسح الطعام'],
  ])('opens the exact food scanner safely in %s without a provider', async (language, question) => {
    const fetchImpl = vi.fn()
    expect(isDirectNavigationRequest(question)).toBe(true)
    expect(directHelpDestination(question)?.targetId).toBe('nutrition-scanner-v2')
    const result = await answerAiHelpQuestion({ body: { language, messages: [{ role: 'user', content: question }] }, env: {}, fetchImpl, userId: 'signed-in' })
    expect(result.tool).toMatchObject({ sectionId: 'nutrition', targetId: 'nutrition-scanner-v2' })
    expect(result.answer).toBe(helpChrome(language).navigate)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('does not mistake how-to questions for commands or accept arbitrary targets', () => {
    for (const q of ['Hur hittar jag matscanningen?', 'How do I open the food scanner?', '¿Cómo abro el escáner?', 'كيف أفتح ماسح الطعام؟']) expect(isDirectNavigationRequest(q)).toBe(false)
    expect(sanitizeHelpTool({ name: 'open-section', sectionId: 'nutrition', targetId: 'delete-account' })).not.toHaveProperty('targetId')
    const navigate = vi.fn()
    expect(commitHelpSectionOpen('social', { socialEnabled: false, changeSection: navigate })).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
  it.each([
    ['sv','Vilket abonnemang har jag?','Och när förnyas det?'],
    ['en','What is my subscription?','And when does it renew?'],
    ['es','¿Cuál es mi suscripción?','Y cuándo se renueva?'],
    ['ar','ما هو اشتراكي؟','ومتى يتم التجديد؟'],
  ])('keeps a %s follow-up on verified customer facts without repeating an action', (language, first, followup) => {
    const selection = selectCustomerConversation([{ role: 'user', content: first }, { role: 'assistant', content: 'Untrusted prior reply' }, { role: 'user', content: followup }])
    expect(selection.personal).toBe(true)
    expect(selection.cancel).toBe(false)
    expect(selection.planChange).toBe(false)
    expect(selection.undoCancel).toBe(false)
    expect(selection.slices).toContain('subscription')
    const answer = renderVerifiedAnswer({ context: { available: true, subscription: { plan_id: 'premium', status: 'ACTIVE', current_period_end: '2026-11-01' } }, languageCode: language, selection })
    expect(answer).toContain('2026-11-01')
  })
  it.each([['es','Cancela mi suscripción'],['ar','ألغ اشتراكي']])('requires explicit confirmation in %s', (languageCode, question) => {
    expect(selectCustomerContext(question).cancel).toBe(true)
    const result = renderCancelOffer({ context: { available: true, subscription: { status: 'ACTIVE' } }, languageCode })
    expect(result.confirmation).toEqual({ action: 'schedule_cancel' })
    expect(result.answer).not.toMatch(/Cancellation happens|Uppsägning sker/)
  })
  it('does not turn negations or another-language completed-action claims into account actions', () => {
    for (const q of ['Jag vill inte avsluta mitt abonnemang', "Don't cancel my subscription", 'No quiero cancelar mi suscripción', 'لا أريد إلغاء اشتراكي']) expect(wantsScheduleCancel(q)).toBe(false)
    for (const answer of ['I have deleted your account.', 'Your subscription has been canceled.', 'He cancelado tu suscripción.', 'تم حذف حسابك.']) expect(answerIsAllowed(answer)).toBe(false)
  })
  it.each(['How many food scans do I have left?', '¿Cuánta cuota me queda?', 'كم تبقى لدي من الحصة؟'])('selects verified quota data for %s', (question) => {
    expect(selectCustomerContext(question)).toMatchObject({ personal: true, focus: 'usage' })
  })
  it('keeps plan changes and reactivation behind an explicit confirmed plan or scheduled cancellation', () => {
    const change = selectCustomerContext('Byt mitt abonnemang till plan.prelim.sek.month.07')
    expect(change).toMatchObject({ planChange: true, planId: 'plan.prelim.sek.month.07', undoCancel: false })
    expect(renderPlanChangeOffer({
      context: { available: true, plan: { currency: 'SEK', plan_id: 'plan.prelim.sek.month.04', price_minor: 400 }, subscription: { plan_id: 'plan.prelim.sek.month.04', status: 'ACTIVE' } },
      planId: change.planId,
    }).confirmation).toEqual({ action: 'plan_change', planId: 'plan.prelim.sek.month.07' })
    expect(selectCustomerContext('Hur byter jag mitt abonnemang?').planChange).toBe(false)
    expect(selectCustomerContext('Byt mitt abonnemang till plan.free').planId).toBe('')
    const undo = renderUndoCancelOffer({
      context: { available: true, subscription: { cancel_at_period_end: true, current_period_end: '2026-11-01', status: 'ACTIVE' } },
      languageCode: 'es',
    })
    expect(selectCustomerContext('Deshacer la cancelación de mi suscripción').undoCancel).toBe(true)
    expect(undo.confirmation).toEqual({ action: 'undo_cancel' })
    expect(undo.answer).not.toMatch(/Uppsägning/)
    const idle = renderUndoCancelOffer({
      context: { available: true, subscription: { cancel_at_period_end: false, status: 'PAST_DUE' } },
    })
    expect(idle.confirmation).toBeNull()
    expect(idle.answer).toContain('PAST_DUE')
    const follow = selectCustomerConversation([
      { content: 'Byt mitt abonnemang till plan.prelim.sek.month.07', role: 'user' },
      { content: 'Och när förnyas mitt abonnemang?', role: 'user' },
    ])
    expect(follow.planChange).toBe(false)
    expect(follow.focus).toBe('renewal')
    expect(selectCustomerContext('Hur betalar jag igen?').hostedCheckout).toBe(false)
    expect(selectCustomerContext('Nytt betalningsförsök för plan.prelim.sek.month.07')).toMatchObject({
      hostedCheckout: true,
      planId: 'plan.prelim.sek.month.07',
    })
    const blocked = renderHostedCheckoutOffer({
      context: { available: true, subscription: { status: 'PAST_DUE' } },
      planId: 'plan.prelim.sek.month.07',
    })
    expect(blocked.confirmation).toBeNull()
    expect(renderRefundAnswer({ context: { available: true, subscription: { status: 'ACTIVE' } }, languageCode: 'es' }).answer).not.toMatch(/Återbetalning/)
  })

  it('offers password reset and account deletion only as separate confirmations', () => {
    expect(selectCustomerContext('Hur återställer jag lösenordet?').passwordReset).toBe(false)
    expect(selectCustomerContext('Jag vill inte radera mitt konto').deleteAccount).toBe(false)
    expect(selectCustomerContext('Återställ mitt lösenord')).toMatchObject({ passwordReset: true, deleteAccount: false })
    expect(selectCustomerContext('Radera mitt konto')).toMatchObject({ deleteAccount: true, passwordReset: false })
    expect(selectCustomerContext('Byt min e-post till annan@example.test').emailChange).toBe(true)
    expect(selectCustomerContext('Ändra mitt namn till Anna').profileChange).toBe(true)
    const typed = selectCustomerContext('Lösenordet är hunter2')
    expect(typed.secretRefused).toBe(true)
    expect(typed.passwordReset).toBe(false)
    expect(JSON.stringify(typed)).not.toMatch(/hunter2/)
    const inherited = selectCustomerConversation([
      { content: 'Radera mitt konto', role: 'user' },
      { content: 'Och när förnyas mitt abonnemang?', role: 'user' },
    ])
    expect(inherited.deleteAccount).toBe(false)
    const reset = renderAccountAnswer({
      account: { createdAt: '2026-01-01T00:00:00Z', email: 'owner@example.test', emailConfirmed: true },
      kind: 'password-reset',
    })
    expect(reset.confirmation).toEqual({ action: 'password_reset' })
    expect(reset.answer).not.toMatch(/hunter2|reset-code/)
    expect(renderAccountAnswer({ account: { email: 'owner@example.test' }, kind: 'email-change' }).confirmation).toBeNull()
  })
})
