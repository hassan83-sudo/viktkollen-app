/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { blockingAxeViolations, formatAxeViolations } from '../../test/a11y/axe.js'
import { expectFocusInside, expectFocusNotOnBody, expectFocusOn } from '../../test/a11y/focus.js'

// A11Y-8F: automated axe scans and accessible-name regressions for the
// central components (jsdom). The browser suite in tests/a11y covers the
// same views in the running app, including colour contrast.

const voiceCalls = vi.hoisted(() => ({
  loadActivePlaceVoiceCalls: vi.fn(),
  startPlaceVoiceCall: vi.fn(),
  subscribePlaceVoiceCalls: vi.fn(() => () => {}),
  updatePlaceVoiceCall: vi.fn(),
}))
const voiceAudio = vi.hoisted(() => ({
  setPlaceVoiceMicrophone: vi.fn(() => true),
  startPlaceVoiceAudio: vi.fn(),
  stopPlaceVoiceAudio: vi.fn(),
}))
vi.mock('../../features/place/placeVoiceCallService.js', () => voiceCalls)
vi.mock('../../features/place/placeVoiceAudioService.js', () => voiceAudio)
vi.mock('../../features/place/placeFamilyMemberService.js', () => ({ displayNameForUser: () => 'Anna' }))

const { default: PlaceVoiceCallPanel } = await import('../place/PlaceVoiceCallPanel.jsx')
const { default: NoticeKitchenTimers } = await import('../NoticeKitchenTimers.jsx')
const { default: MoreHub } = await import('../more/MoreHub.jsx')
const { default: AccessibilityHub } = await import('../more/AccessibilityHub.jsx')
const { default: AiCoachOverlay } = await import('../AiCoachOverlay.jsx')
const { default: ChatInput } = await import('../ChatInput.jsx')
const { default: AiCoachControls } = await import('../aiCoach/AiCoachControls.jsx')
const { default: AiEarMode } = await import('../../features/ai-ear/AiEarMode.jsx')
const { default: ReadySection } = await import('../sections/ReadySection.jsx')
const { default: SocialStage } = await import('../../features/social/components/SocialStage.jsx')
const { default: BottomNavigation } = await import('../app/BottomNavigation.jsx')
const { default: ModalDialog } = await import('./ModalDialog.jsx')

async function expectNoBlockingViolations(context = document.body) {
  const violations = await blockingAxeViolations(context)
  expect(violations, formatAxeViolations(violations)).toEqual([])
}

function coachOverlay(props = {}) {
  return (
    <AiCoachOverlay
      canClearChat={false}
      chatInput=""
      chatMessages={[]}
      isAiSpeaking={false}
      isAiVoiceEnabled={false}
      isListening={false}
      isVoiceConversationActive={false}
      isVoiceMuted={false}
      onAiVoiceEnabledChange={vi.fn()}
      onChatInputChange={vi.fn()}
      onClearChat={vi.fn()}
      onClose={vi.fn()}
      onSendChatMessage={vi.fn((event) => event.preventDefault())}
      onStartVoiceInput={vi.fn()}
      onStarterPrompt={vi.fn()}
      onStopAiVoiceResponse={vi.fn()}
      onToggleVoiceMute={vi.fn()}
      starterPrompts={['Hur mycket protein?']}
      voiceStatus=""
      {...props}
    />
  )
}

function renderAccessibilityFolder() {
  return render(
    <main>
      <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
        <AccessibilityHub onOpenEar={vi.fn()} onOpenEye={vi.fn()} />
      </MoreHub>
    </main>,
  )
}

async function openWalkie() {
  render(<main><PlaceVoiceCallPanel familyId="family" familyMembers={[]} open targetUserId="anna" onClose={vi.fn()} /></main>)
  await screen.findByText(/Samtal pågår med Anna/)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Walkie-talkie' }))
  await screen.findByRole('button', { name: 'Börja prata' })
}

function fireWakeAlarm() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T06:59:00'))
  render(
    <main>
      <NoticeKitchenTimers reminderState={{ reminders: [] }} onRemindersChange={vi.fn()} onMessage={vi.fn()} />
    </main>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Sovrum' }))
  fireEvent.change(screen.getByLabelText('Väckningstid'), { target: { value: '07:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sätt väckarklocka' }))
  act(() => { vi.advanceTimersByTime(61000) })
  // axe schedules its own work; the alarm is already showing.
  vi.useRealTimers()
}

describe('automated accessibility regression suite (A11Y-8F)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
    vi.clearAllMocks()
    voiceCalls.loadActivePlaceVoiceCalls.mockResolvedValue({ data: [{ callee_user_id: 'anna', caller_user_id: 'me', family_id: 'family', id: 'call-1', status: 'accepted' }], userId: 'me' })
    voiceCalls.subscribePlaceVoiceCalls.mockReturnValue(() => {})
    voiceAudio.startPlaceVoiceAudio.mockResolvedValue({})
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak: vi.fn() } })
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.body.style.overflow = ''
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  describe('axe: views and dialogs', () => {
    it('Mer (folder list)', async () => {
      render(<main><MoreHub isAuthenticated syncStatus={{ online: true, statusCode: 'synced', statusLabel: 'Synkad' }} onOpen={vi.fn()} /></main>)
      await expectNoBlockingViolations()
    })

    it('Tillgänglighet (accessibility folder)', async () => {
      renderAccessibilityFolder()
      await expectNoBlockingViolations()
    })

    it('Tal & kommunikation with a selected phrase', async () => {
      renderAccessibilityFolder()
      fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Hjälp mig' }))
      await expectNoBlockingViolations()
    })

    it('AI Coach dialog', async () => {
      render(coachOverlay())
      screen.getByRole('dialog', { name: 'AI Coach' })
      await expectNoBlockingViolations()
    })

    it('Social dialog', async () => {
      render(<SocialStage enabled onClose={vi.fn()} />)
      screen.getByRole('dialog', { name: 'Vänner' })
      await expectNoBlockingViolations()
    })

    it('Ready dialog (Minnesträning)', async () => {
      render(<ReadySection activeSection="redo" onNavigateSection={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Minnesträning/ }))
      screen.getByRole('dialog', { name: 'Alla tekniker' })
      await expectNoBlockingViolations()
    })

    it('Place-style modal (the shared ModalDialog that every Place dialog uses)', async () => {
      render(
        <>
          <main><button type="button">Bakgrund</button></main>
          <ModalDialog aria-label="Batterisnålt läge" className="ready-modal" onClose={vi.fn()}>
            <h2>Batterisnålt läge</h2>
            <p>Platsen uppdateras mer sällan.</p>
            <button type="button">Stäng</button>
          </ModalDialog>
        </>,
      )
      await expectNoBlockingViolations()
    })

    it('visual wake alarm', async () => {
      fireWakeAlarm()
      screen.getByRole('alertdialog', { name: 'Väckarklockan ringer' })
      await expectNoBlockingViolations()
    })

    it('walkie-talkie', async () => {
      await openWalkie()
      await expectNoBlockingViolations()
    })

    it('AI-örat', async () => {
      render(<main><AiEarMode deps={{ blobToWav: vi.fn(), interpret: vi.fn() }} /></main>)
      await expectNoBlockingViolations()
    })

    it('bottom navigation', async () => {
      render(<BottomNavigation activeSection="more" onSectionChange={vi.fn()} />)
      await expectNoBlockingViolations()
    })
  })

  describe('accessible names of critical controls (found by role and name, never by class)', () => {
    it('ChatInput: field, voice button, send and AI voice', () => {
      render(<ChatInput chatInput="" isAiVoiceEnabled={false} isListening={false} isVoiceConversationActive={false} onAiVoiceEnabledChange={vi.fn()} onChatInputChange={vi.fn()} onSendChatMessage={vi.fn()} onStartVoiceInput={vi.fn()} />)
      expect(screen.getByRole('textbox', { name: 'Fråga till AI Coach' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Starta röstsamtal' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Skicka' })).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: 'AI-röst' })).toBeTruthy()
    })

    it('AI Coach microphone in every state', () => {
      const props = { canClearChat: false, isVoiceMuted: false, onClearChat: vi.fn(), onStartVoiceInput: vi.fn(), onStopAiVoiceResponse: vi.fn(), onToggleVoiceMute: vi.fn(), phaseLabel: 'Redo' }
      const { rerender } = render(<AiCoachControls {...props} isAiSpeaking={false} isListening={false} isVoiceConversationActive={false} />)
      expect(screen.getByRole('button', { name: 'Tryck för att prata' })).toBeTruthy()
      rerender(<AiCoachControls {...props} isAiSpeaking={false} isListening isVoiceConversationActive />)
      expect(screen.getByRole('button', { name: 'Avsluta samtal' })).toBeTruthy()
      rerender(<AiCoachControls {...props} isAiSpeaking isListening={false} isVoiceConversationActive />)
      expect(screen.getAllByRole('button', { name: 'Avbryt svar' }).length).toBeGreaterThan(0)
    })

    it('AI-örat: record button and audio file upload', () => {
      render(<AiEarMode deps={{ blobToWav: vi.fn(), interpret: vi.fn() }} />)
      expect(screen.getByRole('button', { name: 'Spela in' })).toBeTruthy()
      const upload = screen.getByLabelText('Välj ljudfil')
      expect(upload.getAttribute('type')).toBe('file')
    })

    it('walkie-talkie: switch, toggle, push-to-talk and status', async () => {
      await openWalkie()
      expect(screen.getByRole('checkbox', { name: 'Walkie-talkie' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Börja prata' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Håll inne för att prata' })).toBeTruthy()
      expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain('Walkie-talkie redo. Din mikrofon är av.')
    })

    it('wake alarm: stop and snooze', () => {
      fireWakeAlarm()
      const alarm = screen.getByRole('alertdialog', { name: 'Väckarklockan ringer' })
      expect(within(alarm).getByRole('button', { name: 'Stäng av larmet' })).toBeTruthy()
      expect(within(alarm).getByRole('button', { name: 'Snooza 5 min' })).toBeTruthy()
    })

    it('navigation: named landmark, one current page, named links', () => {
      render(<BottomNavigation activeSection="more" onSectionChange={vi.fn()} />)
      const nav = screen.getByRole('navigation', { name: 'Huvudnavigation' })
      const links = within(nav).getAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(5)
      // A11Y-8G: each link is named by its visible label (WCAG 2.5.3).
      links.forEach((link) => expect(within(nav).getByRole('link', { name: link.querySelector('strong').textContent })).toBe(link))
      expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1)
    })
  })

  describe('focus regressions', () => {
    it('Stoppa in Tal & kommunikation hands focus to Läs upp instead of <body>', () => {
      renderAccessibilityFolder()
      fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Hjälp mig' }))
      const speak = screen.getByRole('button', { name: 'Läs upp' })
      fireEvent.click(speak)
      const stop = screen.getByRole('button', { name: 'Stoppa' })
      stop.focus()
      fireEvent.click(stop)
      expect(screen.queryByRole('button', { name: 'Stoppa' })).toBeNull()
      expectFocusOn(speak)
      expectFocusNotOnBody()
    })

    it('Stoppa keeps focus on Läs upp when speech ends by itself', () => {
      renderAccessibilityFolder()
      fireEvent.click(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Hjälp mig' }))
      fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
      screen.getByRole('button', { name: 'Stoppa' }).focus()
      const utterance = window.speechSynthesis.speak.mock.calls.at(-1)[0]
      act(() => { utterance.onend?.() })
      expectFocusOn(screen.getByRole('button', { name: 'Läs upp' }))
    })

    it('the dialog focus trap follows content that changes after opening (8C)', () => {
      function GrowingDialog() {
        const [expanded, setExpanded] = useState(false)
        const closeRef = useRef(null)
        return (
          <ModalDialog aria-label="Dynamisk dialog" initialFocusRef={closeRef} onClose={vi.fn()}>
            <button ref={closeRef} type="button">Stäng</button>
            <button type="button" onClick={() => setExpanded(true)}>Visa mer</button>
            {expanded && <><input aria-label="Nytt fält" /><button type="button">Ny sista knapp</button></>}
          </ModalDialog>
        )
      }
      render(<><main><button type="button">Bakgrund</button></main><GrowingDialog /></>)
      const dialog = screen.getByRole('dialog', { name: 'Dynamisk dialog' })
      fireEvent.click(screen.getByRole('button', { name: 'Visa mer' }))
      const newLast = screen.getByRole('button', { name: 'Ny sista knapp' })

      // Tab from the new last control wraps to the first one…
      newLast.focus()
      fireEvent.keyDown(newLast, { key: 'Tab' })
      expectFocusOn(screen.getByRole('button', { name: 'Stäng' }))
      // …and Shift+Tab from the first reaches the newly added last control.
      fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true })
      expectFocusOn(newLast)
      for (let index = 0; index < 12; index += 1) {
        fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: index % 2 === 0 })
        expectFocusInside(dialog)
      }
    })
  })
})
