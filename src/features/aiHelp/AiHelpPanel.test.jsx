/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AiHelpPanel from './AiHelpPanel.jsx'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer session-token',
    ok: true,
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
    ['ar', 'rtl', 'Open AI Help'],
  ])('follows the app language %s', async (code, direction, openLabel) => {
    await i18n.changeLanguage(code)
    render(<AiHelpPanel />)

    const panel = screen.getByRole('region', { name: openLabel === 'Öppna AI-Hjälp' ? 'AI-Hjälp' : 'AI Help' })
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
    await waitFor(() => expect(screen.getByRole('region', { name: 'AI Help' }).getAttribute('dir')).toBe('rtl'))
    fetchMock.mockClear()
    fireEvent.change(screen.getByLabelText('Ask about Viktkollen'), {
      target: { value: 'أين اللغة؟' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).language).toBe('ar')
    fetchMock.mockRestore()
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

  it('waits for the cancellation button before calling billing', async () => {
    await i18n.changeLanguage('sv')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/billing/cancel')) {
        return { ok: true, json: async () => ({ ok: true }) }
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
    const billingCalls = () => fetchMock.mock.calls.filter((call) => String(call[0]).includes('/api/billing/cancel'))
    expect(billingCalls()).toHaveLength(0)
    fireEvent.click(confirm)
    await waitFor(() => expect(billingCalls()).toHaveLength(1))
    expect(billingCalls()[0][1].body).toBe('{}')
    expect(await screen.findByText('Uppsägningen är schemalagd till periodens slut.')).toBeTruthy()
    fetchMock.mockRestore()
  })
})
