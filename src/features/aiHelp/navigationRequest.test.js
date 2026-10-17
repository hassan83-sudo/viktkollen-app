import { describe, expect, it, vi } from 'vitest'
import { directHelpDestination, isDirectNavigationRequest } from './navigationRequest.js'
import { sanitizeHelpTool, commitHelpSectionOpen } from './aiHelpTools.js'
import { answerAiHelpQuestion, answerIsAllowed } from '../../../api/_shared/aiHelp/service.js'
import { selectCustomerConversation } from '../../../api/_shared/aiHelp/customerConversation.js'
import { renderCancelOffer, renderVerifiedAnswer, selectCustomerContext, wantsScheduleCancel } from '../../../api/_shared/aiHelp/customerContext.js'
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
})
