/** @vitest-environment jsdom */
import process from 'node:process'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/_shared/aiHelp/httpHandler.js'
import { clearAiHelpRateLimitForTests } from '../../../api/_shared/aiHelp/costGuard.js'
import { createTestCostStore } from '../../../api/_shared/aiHelp/sharedCostLedger.js'
import { setAiHelpCostStoreForTests } from '../../../api/_shared/aiHelp/service.js'
import { setSupabaseAuthVerifierForTests } from '../../../api/_shared/verifySupabaseUser.js'
import i18n from '../../i18n/index.js'
import AiHelpPanel from './AiHelpPanel.jsx'

vi.mock('../../services/ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer session-token',
    ok: true,
  })),
}))

function createResponse() {
  const response = {
    body: null,
    headers: {},
    statusCode: 200,
    json(body) {
      response.body = body
      return response
    },
    setHeader(name, value) {
      response.headers[name] = value
    },
    status(code) {
      response.statusCode = code
      return response
    },
  }
  return response
}

describe('AI Help mocked chat chain', () => {
  beforeEach(async () => {
    window.sessionStorage.clear()
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.AI_HELP_BUDGET_SEK = '1000'
    setAiHelpCostStoreForTests(createTestCostStore())
    setSupabaseAuthVerifierForTests(async () => ({ user: { id: 'chain-user' } }))
    await i18n.changeLanguage('sv')
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('api.openai.com')) {
        const body = JSON.parse(init.body)
        const latest = body.input.at(-1).content[0].text
        return {
          ok: true,
          json: async () => ({
            output_text: JSON.stringify({
              answer: latest.includes('sedan')
                ? 'Klicka på språklistan i Inställningar.'
                : 'Öppna Mer och sedan Inställningar.',
              featureIds: ['settings.language'],
              status: 'answered',
            }),
          }),
        }
      }

      const response = createResponse()
      await handler({
        body: JSON.parse(init.body),
        headers: { authorization: init.headers.Authorization || init.headers.authorization },
        method: 'POST',
      }, response)
      return {
        json: async () => response.body,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
      }
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setSupabaseAuthVerifierForTests(null)
    setAiHelpCostStoreForTests(null)
    clearAiHelpRateLimitForTests()
    delete process.env.OPENAI_API_KEY
    delete process.env.AI_HELP_BUDGET_SEK
  })

  it('shows a mocked Swedish answer and sends the follow-up with history', async () => {
    render(<AiHelpPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI-Hjälp' }))
    fireEvent.change(screen.getByLabelText('Fråga om Viktkollen'), {
      target: { value: 'Kan du förklara språket på ett annat sätt?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))

    expect(await screen.findByText('Öppna Mer och sedan Inställningar.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Fråga om Viktkollen'), {
      target: { value: 'Och var klickar jag sedan?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    expect(await screen.findByText('Klicka på språklistan i Inställningar.')).toBeTruthy()

    const appCalls = fetch.mock.calls.filter((call) => call[0] === '/api/ai-help')
    const followUp = JSON.parse(appCalls.at(-1)[1].body)
    expect(followUp.language).toBe('sv')
    expect(followUp.messages.map((message) => message.content)).toEqual([
      'Kan du förklara språket på ett annat sätt?',
      'Öppna Mer och sedan Inställningar.',
      'Och var klickar jag sedan?',
    ])
    expect(followUp.featureIds).toEqual(['settings.language'])
    expect(JSON.stringify(appCalls)).not.toMatch(/OPENAI_API_KEY|test-key/)
  })
})
