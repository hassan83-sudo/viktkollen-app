/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AiHelpPanel from './AiHelpPanel.jsx'
import { helpChrome } from './uiChrome.js'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  hasSameAiAuthUser: vi.fn(async () => true),
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer session-token',
    ok: true,
    userScope: 'user-a',
  })),
}))

describe('AiHelpPanel language', () => {
  beforeEach(async () => {
    cleanup()
    window.sessionStorage.clear()
    await i18n.changeLanguage('sv')
  })

  it.each([
    ['sv', 'ltr', 'Öppna AI-Hjälp'],
    ['en', 'ltr', 'Open AI Help'],
    ['zh-CN', 'ltr', 'Open AI Help'],
    ['ar', 'rtl', 'افتح مساعدة الذكاء الاصطناعي'],
    ['es', 'ltr', 'Abrir Ayuda IA'],
  ])('follows the app language %s', async (code, direction, openLabel) => {
    await i18n.changeLanguage(code)
    render(<AiHelpPanel />)

    const panel = screen.getByRole('region', { name: helpChrome(code).title })
    expect(panel.getAttribute('lang')).toBe(code)
    expect(panel.getAttribute('dir')).toBe(direction)
    expect(screen.getByRole('button', { name: openLabel })).toBeTruthy()
  })

  it('sends the active language and keeps the reply in the thread', async () => {
    await i18n.changeLanguage('zh-CN')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '在设置中更改语言。',
        featureIds: ['settings.language'],
        language: { code: 'zh-CN', direction: 'ltr', fallback: false },
        ok: true,
        status: 'answered',
      }),
    })

    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Help' }))
    fireEvent.change(screen.getByLabelText('Ask about Viktkollen'), {
      target: { value: '如何更改语言？' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('在设置中更改语言。')).toBeTruthy()
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request.language).toBe('zh-CN')
    expect(request.messages.at(-1).content).toBe('如何更改语言？')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')

    await i18n.changeLanguage('ar')
    await waitFor(() => expect(screen.getByRole('region', { name: helpChrome('ar').title }).getAttribute('dir')).toBe('rtl'))
    fetchMock.mockClear()
    fireEvent.change(screen.getByLabelText(helpChrome('ar').placeholder), {
      target: { value: 'أين اللغة؟' },
    })
    fireEvent.click(screen.getByRole('button', { name: helpChrome('ar').send }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).language).toBe('ar')
    fetchMock.mockRestore()
  })

  it('discards legacy private threads and cancellation actions', () => {
    window.sessionStorage.setItem('viktkollen.aiHelp.thread', JSON.stringify([
      { content: 'Previous account private facts', role: 'assistant', confirmation: { action: 'schedule_cancel' } },
    ]))
    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    expect(screen.queryByText('Previous account private facts')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Bekräfta uppsägning' })).toBeNull()
    expect(window.sessionStorage.getItem('viktkollen.aiHelp.thread')).toBeNull()
  })

  it('opens an allowlisted section only after the app confirms it', async () => {
    await i18n.changeLanguage('sv')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Tryck på Min resa i den nedre navigeringen.',
        featureIds: ['navigation.journey'],
        ok: true,
        source: 'local',
        status: 'answered',
        tool: { label: 'Öppna Min resa', name: 'open-section', sectionId: 'journey' },
      }),
    })

    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    fireEvent.change(screen.getByLabelText('Fråga om Viktkollen'), {
      target: { value: 'Hur öppnar jag Min resa?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))

    const open = await screen.findByRole('button', { name: 'Öppna Min resa' })
    fireEvent.click(open)
    expect(screen.getByRole('button', { name: 'Öppna Min resa' })).toBeTruthy()
    window.dispatchEvent(new CustomEvent('viktkollen:ai-help-section-opened', {
      detail: { sectionId: 'home' },
    }))
    expect(screen.getByRole('button', { name: 'Öppna Min resa' })).toBeTruthy()
    window.dispatchEvent(new CustomEvent('viktkollen:ai-help-section-opened', {
      detail: { sectionId: 'journey' },
    }))
    expect(await screen.findByRole('button', { name: 'Avsnittet är öppnat.' })).toBeTruthy()
  })

  it('navigates immediately for an explicit request, but not for a how-to question', async () => {
    const navigation = vi.fn()
    window.addEventListener('viktkollen:ai-help-open-section', navigation)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Öppna Mat.',
        featureIds: ['more.nutrition'],
        ok: true,
        source: 'local',
        status: 'answered',
        tool: { label: 'Öppna Mat', name: 'open-section', sectionId: 'nutrition' },
      }),
    })
    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    const question = screen.getByLabelText('Fråga om Viktkollen')
    fireEvent.change(question, { target: { value: 'Hur hittar jag matscanning?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    await screen.findByText('Öppna Mat.')
    expect(navigation).not.toHaveBeenCalled()
    fireEvent.change(question, { target: { value: 'Ta mig till matscanning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    await waitFor(() => expect(navigation).toHaveBeenCalledTimes(1))
    expect(navigation.mock.calls[0][0].detail.sectionId).toBe('nutrition')
    window.removeEventListener('viktkollen:ai-help-open-section', navigation)
    fetchMock.mockRestore()
  })

  it('waits for the cancellation button before calling billing', async () => {
    await i18n.changeLanguage('sv')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).includes('/api/ai-help') && String(options?.body || '').includes('confirmAction')) {
        return { ok: true, json: async () => ({ ok: true, action: 'schedule_cancel' }) }
      }
      return {
        ok: true,
        json: async () => ({
          answer: 'Inget har ändrats ännu.',
          confirmation: { action: 'schedule_cancel' },
          ok: true,
          status: 'answered',
        }),
      }
    })

    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    fireEvent.change(screen.getByLabelText('Fråga om Viktkollen'), {
      target: { value: 'Avsluta mitt abonnemang' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))

    const confirm = await screen.findByRole('button', { name: 'Bekräfta uppsägning' })
    const actionCalls = () => fetchMock.mock.calls.filter((call) => String(call[1]?.body || '').includes('confirmAction'))
    expect(actionCalls()).toHaveLength(0)
    fireEvent.click(confirm)
    await waitFor(() => expect(actionCalls()).toHaveLength(1))
    const body = JSON.parse(actionCalls()[0][1].body)
    expect(body).toEqual({ confirmAction: 'schedule_cancel', confirmed: true })
    expect(JSON.stringify(body)).not.toContain('Avsluta mitt abonnemang')
    expect(await screen.findByText('Uppsägningen är schemalagd till periodens slut.')).toBeTruthy()
    fetchMock.mockRestore()
  })

  it('reports a technical problem without the question text', async () => {
    await i18n.changeLanguage('sv')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    fireEvent.change(screen.getByLabelText('Fråga om Viktkollen'), {
      target: { value: 'Hemligt chattinnehåll' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rapportera tekniskt fel' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      errorType: 'ai-help',
      feature: 'ai-help',
      fingerprint: 'ai-help-manual',
      source: 'ai-help',
    })
    expect(JSON.stringify(body)).not.toContain('Hemligt')
    expect(await screen.findByText('Felrapporten skickades utan frågetexten.')).toBeTruthy()
    fetchMock.mockRestore()
  })
})
