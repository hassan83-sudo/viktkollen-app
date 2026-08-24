import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('AI Coach tap me and realtime voice security', () => {
  it('puts tap me on the Home AI Coach card', () => {
    const source = readSource('src/components/app/OverviewDashboard.jsx')
    const coachStart = source.indexOf('className="overview-primary-action is-coach"')
    const tapMeOnCoachCard = source.indexOf('<span className="overview-tap-me">tap me</span>', coachStart)
    const coachCard = source.slice(coachStart, tapMeOnCoachCard + '<span className="overview-tap-me">tap me</span>'.length)

    expect(coachStart).toBeGreaterThan(-1)
    expect(source).toContain('className="overview-primary-action is-coach"')
    expect(source).toContain('<span className="overview-tap-me">tap me</span>')
    expect(tapMeOnCoachCard).toBeGreaterThan(coachStart)
    expect(coachCard).toContain('overview-primary-action is-coach')
    expect(coachCard).toContain('tap me')
    expect(source).toContain('onOpenAiCoach')
  })

  it('opens the AI Coach overlay from Home and keeps text chat available', () => {
    const appSource = readSource('src/App.jsx')
    const overlaySource = readSource('src/components/AiCoachOverlay.jsx')

    expect(appSource).toContain('onOpenAiCoach={() => setAiCoachOverlayOpen(true)}')
    expect(appSource).toContain('<AiCoachOverlay')
    expect(overlaySource).toContain('Tryck för att prata')
    expect(overlaySource).toContain('<ChatPanel')
    expect(appSource).toContain('function sendChatMessage')
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
