import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AI Help test route boundary', () => {
  it('keeps the shared Vite config free of the AI Help test route', () => {
    const vite = readFileSync(new URL('../../../vite.config.js', import.meta.url), 'utf8')
    const playwright = readFileSync(new URL('../../../playwright.ai-help.config.js', import.meta.url), 'utf8')

    expect(vite).not.toContain('/api/ai-help')
    expect(vite).not.toContain('ai-help-test-api')
    expect(playwright).toContain('/api/ai-help')
    expect(playwright).toContain('ai-help-test-api')
  })

  it('does not put the server key or account actions in the help client', () => {
    const client = readFileSync(new URL('./aiHelpClient.js', import.meta.url), 'utf8')
    const handler = readFileSync(new URL('../../../api/ai-help/index.js', import.meta.url), 'utf8')
    const helpTree = readFileSync(new URL('../../../api/_shared/aiHelp/service.js', import.meta.url), 'utf8')

    expect(client).not.toMatch(/OPENAI_API_KEY|sk-/)
    expect(client).not.toMatch(/AI_HELP_COST_SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE/)
    expect(handler).not.toMatch(/account-deletion|sumup|billing/)
    expect(helpTree).not.toMatch(/account-deletion|sumup|activate_verified/)
  })
})
