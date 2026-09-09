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
    const controlsSource = readSource('src/components/aiCoach/AiCoachControls.jsx')

    expect(appSource).toContain('onOpenAiCoach={() => setAiCoachOverlayOpen(true)}')
    expect(appSource).toContain('<AiCoachOverlay')
    expect(controlsSource).toContain("t('coach:overlay.startVoice')")
    expect(overlaySource).toContain('<ChatInput')
    expect(overlaySource).toContain('<ChatMessageList')
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

  it('opens as a full mobile view and can always be closed via the header X', () => {
    const overlaySource = readSource('src/components/AiCoachOverlay.jsx')
    const headerSource = readSource('src/components/aiCoach/AiCoachHeader.jsx')
    const appSource = readSource('src/App.jsx')

    expect(overlaySource).toContain('role="dialog"')
    expect(overlaySource).toContain('aria-modal="true"')
    expect(overlaySource).toContain('<AiCoachHeader onClose={onClose} />')
    expect(headerSource).toContain('onClick={onClose}')
    expect(headerSource).toContain("aria-label={t('coach:overlay.close')}")
    expect(appSource).toContain('onClose={closeAiCoachOverlay}')
    expect(appSource).toContain('function closeAiCoachOverlay')
  })

  it('splits the overlay into isolated header, hero, controls, suggestions, messages and composer pieces', () => {
    const overlaySource = readSource('src/components/AiCoachOverlay.jsx')

    expect(overlaySource).toContain("import AiCoachHeader from './aiCoach/AiCoachHeader.jsx'")
    expect(overlaySource).toContain("import AiCoachHero from './aiCoach/AiCoachHero.jsx'")
    expect(overlaySource).toContain("import AiCoachControls from './aiCoach/AiCoachControls.jsx'")
    expect(overlaySource).toContain("import AiCoachSuggestions from './aiCoach/AiCoachSuggestions.jsx'")
    expect(overlaySource).toContain("import ChatMessageList from './ChatMessageList.jsx'")
    expect(overlaySource).toContain("import ChatInput from './ChatInput.jsx'")
    expect(overlaySource).toContain('<AiCoachHeader')
    expect(overlaySource).toContain('<AiCoachHero')
    expect(overlaySource).toContain('<AiCoachControls')
    expect(overlaySource).toContain('<AiCoachSuggestions')
    expect(overlaySource).toContain('<ChatMessageList')
    expect(overlaySource).toContain('<ChatInput')
  })

  it('renders a visible "Exempel på frågor" suggestions section wired to the existing starter-prompt handler', () => {
    const suggestionsSource = readSource('src/components/aiCoach/AiCoachSuggestions.jsx')

    expect(suggestionsSource).toContain("t('coach:overlay.suggestionsTitle')")
    expect(suggestionsSource).toContain("import QuickActions from '../QuickActions.jsx'")
    expect(suggestionsSource).toContain('onStarterPrompt={onStarterPrompt}')
    expect(suggestionsSource).toContain('starterPrompts={starterPrompts}')
  })

  it('keeps existing coach controls (Avsluta, Mute, Avbryt svar, Rensa chatten) wired to unchanged handlers', () => {
    const controlsSource = readSource('src/components/aiCoach/AiCoachControls.jsx')

    expect(controlsSource).toContain('onClick={onStartVoiceInput}')
    expect(controlsSource).toContain('onClick={onToggleVoiceMute}')
    expect(controlsSource).toContain('onClick={onStopAiVoiceResponse}')
    expect(controlsSource).toContain('onClick={onClearChat}')
    expect(controlsSource).toContain('disabled={!canClearChat}')
    expect(controlsSource).toContain("t('coach:overlay.clearChat')")
  })

  it('keeps the composer (input + Skicka + voice) as its own structural part, separate from the scrollable message list', () => {
    const overlaySource = readSource('src/components/AiCoachOverlay.jsx')
    const chatInputSource = readSource('src/components/ChatInput.jsx')

    expect(overlaySource).toContain('<div className="ai-coach-overlay-body">')
    expect(overlaySource).toContain('<div className="ai-coach-overlay-composer">')
    expect(overlaySource.indexOf('ai-coach-overlay-body')).toBeLessThan(overlaySource.indexOf('ai-coach-overlay-composer'))
    expect(overlaySource.indexOf('<ChatMessageList')).toBeLessThan(overlaySource.indexOf('<ChatInput'))
    expect(chatInputSource).toContain('placeholder="Skriv en fråga..."')
    expect(chatInputSource).toContain('>Skicka</button>')
  })

  it('presents itself clearly as AI, not a real person', () => {
    const heroSource = readSource('src/components/aiCoach/AiCoachHero.jsx')

    expect(heroSource).toContain("t('coach:overlay.aiLabel')")
    expect(heroSource).toContain("t('coach:overlay.intro')")
  })

  it('uses a real dvh-based flex column so header and composer always stay reachable, with a single scroll area', () => {
    const appCss = readSource('src/App.css')

    expect(appCss).toMatch(/\.ai-coach-overlay\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100dvh;/s)
    expect(appCss).toMatch(/\.ai-coach-overlay-header\s*\{[^}]*flex:\s*0 0 auto;/s)
    expect(appCss).toMatch(/\.ai-coach-overlay-hero\s*\{[^}]*flex:\s*0 0 auto;/s)
    expect(appCss).toMatch(/\.ai-coach-overlay-voice\s*\{[^}]*flex:\s*0 0 auto;/s)
    expect(appCss).toMatch(/\.ai-coach-overlay-body\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s)
    expect(appCss).toMatch(/\.ai-coach-overlay-composer\s*\{[^}]*flex:\s*0 0 auto;/s)
  })

  it('scopes new AI Coach styling to ai-coach-specific selectors and leaves Redo CSS untouched', () => {
    const appCss = readSource('src/App.css')

    expect(appCss).toMatch(/\.ai-coach-overlay-suggestions\s*\{/)
    expect(appCss).toMatch(/\.ai-coach-overlay-suggestions-title\s*\{/)
    expect(appCss).toContain('.ready-forgot-card form {\n  grid-template-columns: minmax(0, 1fr) auto;\n}')
    expect(appCss).toContain('.ready-companion-card {')
  })
})
