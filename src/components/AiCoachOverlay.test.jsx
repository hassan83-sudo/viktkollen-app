import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('AI Coach tap me and realtime voice security', () => {
  it('opens AI Coach from Dagens läge mood card on Home', () => {
    const source = readSource('src/components/app/OverviewDashboard.jsx')

    expect(source).toContain('overview-mood-card is-coach')
    expect(source).toContain("t('home:mood.openCoach')")
    expect(source).toContain('onOpenAiCoach')
    expect(source).toContain("t('home:tapImage')")
    expect(source).not.toContain('is-coach-hero')
  })

  it('opens the AI Coach overlay from Home and keeps text chat available', () => {
    const appSource = readSource('src/App.jsx')
    const overlaySource = readSource('src/components/AiCoachOverlay.jsx')

    expect(appSource).toContain('onOpenAiCoach={() => setAiCoachOverlayOpen(true)}')
    expect(appSource).toContain('<AiCoachOverlay')
    expect(overlaySource).toContain("t('coach:overlay.startVoice')")
    expect(overlaySource).toContain('<ChatPanel')
    expect(appSource).toContain('function sendChatMessage')
    expect(appSource).toContain('onStartVoiceInput={startVoiceInput}')
    expect(appSource).toContain('<HomeSection')
  })

  it('starts voice on one tap and never ships the API key to the browser', () => {
    const appSource = readSource('src/App.jsx')
    const clientSource = readSource('src/services/ai/realtimeVoiceController.js')
    const sessionSource = readSource('src/services/ai/aiChatController.js')

    expect(appSource).toContain('createRealtimeVoiceController')
    expect(appSource).toContain('await realtimeVoiceRef.current.start()')
    expect(clientSource).not.toContain('OPENAI_API_KEY')
    expect(clientSource).toContain('clientSecret')
    expect(sessionSource).toContain("action: 'realtime-session'")
    expect(appSource).not.toMatch(/VITE_OPENAI_API_KEY/)
  })
})
