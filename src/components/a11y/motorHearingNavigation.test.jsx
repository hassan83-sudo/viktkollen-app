/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { getOpenDialogCount } from '../../services/accessibilityDialog.js'
import {
  focusViewHeading,
  formatDocumentTitle,
  setDocumentSection,
  setDocumentSectionDetail,
} from '../../services/accessibilityNavigation.js'

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

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const accessibilityCss = source('src/styles/accessibility.css')

describe('motor, hearing and navigation accessibility (A11Y-8E)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.body.style.overflow = ''
  })

  describe('walkie-talkie', () => {
    const acceptedCall = { callee_user_id: 'anna', caller_user_id: 'me', family_id: 'family', id: 'call-1', status: 'accepted' }

    beforeEach(() => {
      vi.clearAllMocks()
      voiceCalls.loadActivePlaceVoiceCalls.mockResolvedValue({ data: [acceptedCall], userId: 'me' })
      voiceCalls.subscribePlaceVoiceCalls.mockReturnValue(() => {})
      voiceAudio.startPlaceVoiceAudio.mockResolvedValue({})
    })

    async function openWalkie() {
      render(<PlaceVoiceCallPanel familyId="family" familyMembers={[]} open targetUserId="anna" onClose={vi.fn()} />)
      await screen.findByText(/Samtal pågår med Anna/)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Walkie-talkie' }))
      await screen.findByRole('button', { name: 'Börja prata' })
      voiceAudio.setPlaceVoiceMicrophone.mockClear()
    }

    it('offers a toggle mode that starts and stops talking without holding anything', async () => {
      await openWalkie()
      expect(screen.getByText('Walkie-talkie redo. Din mikrofon är av.').getAttribute('role')).toBe('status')

      fireEvent.click(screen.getByRole('button', { name: 'Börja prata' }))
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', true)
      expect(screen.getByText('Du sänder. Familjemedlemmen hör dig.').getAttribute('role')).toBe('status')

      fireEvent.click(screen.getByRole('button', { name: 'Sluta prata' }))
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', false)
      expect(screen.getByRole('button', { name: 'Börja prata' })).toBeTruthy()
    })

    it('uses native buttons (Enter/Space come from the browser) and no pointer is needed for the toggle', async () => {
      await openWalkie()
      const toggle = screen.getByRole('button', { name: 'Börja prata' })
      expect(toggle.tagName).toBe('BUTTON')
      expect(toggle.getAttribute('type')).toBe('button')
      ;['onkeydown', 'onkeyup', 'onpointerdown'].forEach((handler) => expect(toggle.getAttribute(handler)).toBeNull())
      const walkieSource = source('src/components/place/PlaceVoiceCallPanel.jsx')
      expect(walkieSource).not.toMatch(/onKey(Down|Up)=/)

      toggle.focus()
      fireEvent.click(toggle)
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', true)
    })

    it('keeps push-to-talk: press starts, release stops', async () => {
      await openWalkie()
      const hold = screen.getByRole('button', { name: 'Håll inne för att prata' })
      fireEvent.pointerDown(hold)
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', true)
      expect(screen.getByRole('button', { name: 'Pratar…' }).getAttribute('aria-pressed')).toBe('true')
      fireEvent.pointerUp(screen.getByRole('button', { name: 'Pratar…' }))
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', false)
    })

    it('lets keyboard or switch activation of the hold button toggle instead of doing nothing', async () => {
      await openWalkie()
      // A click without a pointer press (Enter, Space, switch) has detail 0.
      fireEvent.click(screen.getByRole('button', { name: 'Håll inne för att prata' }), { detail: 0 })
      expect(voiceAudio.setPlaceVoiceMicrophone).toHaveBeenLastCalledWith('call-1', true)
    })

    it('never ends a toggle-started transmission when the pointer just passes the hold button', async () => {
      await openWalkie()
      fireEvent.click(screen.getByRole('button', { name: 'Börja prata' }))
      voiceAudio.setPlaceVoiceMicrophone.mockClear()
      fireEvent.pointerLeave(screen.getByRole('button', { name: 'Pratar…' }))
      fireEvent.pointerUp(screen.getByRole('button', { name: 'Pratar…' }))
      expect(voiceAudio.setPlaceVoiceMicrophone).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Sluta prata' })).toBeTruthy()
    })

    it('shows connection problems as text status', async () => {
      voiceAudio.startPlaceVoiceAudio.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      render(<PlaceVoiceCallPanel familyId="family" familyMembers={[]} open targetUserId="anna" onClose={vi.fn()} />)
      const notice = await screen.findByText(/Mikrofonen är blockerad/)
      expect(notice.getAttribute('role')).toBe('status')
    })

    it('does not add a paid or new audio service: only the existing microphone function is used', () => {
      const walkieSource = source('src/components/place/PlaceVoiceCallPanel.jsx')
      expect(walkieSource).toContain('setPlaceVoiceMicrophone(relevant.id,active)')
      expect(walkieSource).not.toMatch(/fetch\(|openai|realtime|speechSynthesis|SpeechRecognition/i)
    })
  })

  describe('visual wake alarm', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-22T06:59:00'))
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak: vi.fn() } })
      globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
        this.text = text
      }
    })

    afterEach(() => {
      delete window.speechSynthesis
      delete globalThis.SpeechSynthesisUtterance
      delete window.navigator.vibrate
    })

    function armAndFireAlarm() {
      render(
        <main>
          <NoticeKitchenTimers reminderState={{ reminders: [] }} onRemindersChange={vi.fn()} onMessage={vi.fn()} />
        </main>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Sovrum' }))
      fireEvent.change(screen.getByLabelText('Väckningstid'), { target: { value: '07:00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Sätt väckarklocka' }))
      act(() => { vi.advanceTimersByTime(61000) })
    }

    it('shows a text-based alarm with the time and what to do, not only sound', () => {
      armAndFireAlarm()
      const alarm = screen.getByRole('alertdialog', { name: 'Väckarklockan ringer' })
      expect(alarm.getAttribute('aria-modal')).toBe('true')
      expect(document.getElementById(alarm.getAttribute('aria-describedby')).textContent).toBe('Dags att vakna.')
      expect(alarm.textContent).toContain('Larm kl. 07:00')
      expect(window.speechSynthesis.speak).toHaveBeenCalled()
    })

    it('is shown on top of every view (portal) using the shared dialog system with an inert background', () => {
      armAndFireAlarm()
      const alarm = screen.getByRole('alertdialog')
      expect(alarm.parentElement).toBe(document.body)
      expect(getOpenDialogCount()).toBe(1)
      expect(document.querySelector('main').closest('[inert]')).not.toBeNull()
    })

    it('focuses the stop button and can be acknowledged with the keyboard', () => {
      armAndFireAlarm()
      const stop = screen.getByRole('button', { name: 'Stäng av larmet' })
      expect(document.activeElement).toBe(stop)

      fireEvent.keyDown(stop, { key: 'Escape' })
      expect(screen.getByRole('alertdialog')).toBeTruthy()

      fireEvent.click(stop)
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(getOpenDialogCount()).toBe(0)
    })

    it('can be snoozed from the visual alarm', () => {
      armAndFireAlarm()
      fireEvent.click(screen.getByRole('button', { name: 'Snooza 5 min' }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      act(() => { vi.advanceTimersByTime(5 * 60000 + 1000) })
      expect(screen.getByRole('alertdialog', { name: 'Väckarklockan ringer' })).toBeTruthy()
    })

    it('vibrates as an extra signal where supported', () => {
      const vibrate = vi.fn()
      Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
      armAndFireAlarm()
      expect(vibrate).toHaveBeenCalledWith([400, 200, 400])
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    })

    it('works when vibration is unsupported or throws', () => {
      Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: () => { throw new Error('blocked') } })
      expect(() => armAndFireAlarm()).not.toThrow()
      expect(screen.getByRole('alertdialog')).toBeTruthy()
    })

    it('uses a stable visual signal without blinking animations', () => {
      const block = accessibilityCss.slice(accessibilityCss.indexOf('.wake-alarm-visual {'))
      const alarmCss = block.slice(0, block.indexOf('/* Walkie-talkie'))
      expect(alarmCss).not.toMatch(/animation|@keyframes|blink/)
      expect(alarmCss).toMatch(/border: 6px solid/)
    })
  })

  describe('navigation', () => {
    it('formats document titles per section and sub view', () => {
      expect(formatDocumentTitle('Hem')).toBe('Hem – Viktkollen')
      expect(formatDocumentTitle('')).toBe('Viktkollen')
      setDocumentSection('home', 'Hem')
      expect(document.title).toBe('Hem – Viktkollen')
      setDocumentSectionDetail('more', 'Tillgänglighet & hjälpmedel')
      expect(document.title).toBe('Hem – Viktkollen')
      setDocumentSection('more', 'Mer')
      expect(document.title).toBe('Tillgänglighet & hjälpmedel – Viktkollen')
      setDocumentSectionDetail('more', null)
      expect(document.title).toBe('Mer – Viktkollen')
    })

    it('focuses the visible primary heading of a view without adding it to the Tab order', () => {
      document.body.innerHTML = '<section id="view"><div hidden><h1>Dold</h1></div><h1>Min resa</h1><button>Knapp</button></section>'
      const view = document.getElementById('view')
      expect(focusViewHeading(view)).toBe(true)
      expect(document.activeElement.textContent).toBe('Min resa')
      expect(document.activeElement.getAttribute('tabindex')).toBe('-1')
      document.body.innerHTML = ''
    })

    it('moves focus to an opened folder heading, back to the folder card on return, and names the page', () => {
      setDocumentSection('more', 'Mer')
      const props = { isAuthenticated: false, onBack: vi.fn(), onOpen: vi.fn(), syncStatus: {} }
      const { rerender } = render(<MoreHub activeFolder={null} {...props} />)
      const card = screen.getByRole('button', { name: /^Tillgänglighet & hjälpmedel/ })
      card.focus()

      rerender(<MoreHub activeFolder="accessibility" {...props} />)
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Tillgänglighet & hjälpmedel' }))
      expect(document.title).toBe('Tillgänglighet & hjälpmedel – Viktkollen')

      rerender(<MoreHub activeFolder={null} {...props} />)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Tillgänglighet & hjälpmedel/ }))
      expect(document.title).toBe('Mer – Viktkollen')
    })

    it('does not move focus for changes inside the same view', () => {
      const props = { isAuthenticated: false, onBack: vi.fn(), onOpen: vi.fn() }
      const { rerender } = render(<MoreHub activeFolder={null} syncStatus={{}} {...props} />)
      const card = screen.getByRole('button', { name: /^Mat/ })
      card.focus()
      rerender(<MoreHub activeFolder={null} syncStatus={{ online: false }} {...props} />)
      expect(document.activeElement).toBe(card)
    })

    it('renders a skip link before <main> that focuses the active view, and updates focus/title on section changes', () => {
      const app = source('src/App.jsx')
      const skip = app.indexOf('className="skip-link"')
      expect(skip).toBeGreaterThan(-1)
      expect(skip).toBeLessThan(app.indexOf('<main className="app-shell">'))
      expect(app).toContain("{t('skipToContent')}")
      expect(app).toContain('onClick={handleSkipToContent}')
      expect(app).toMatch(/setDocumentSection\(activeAppSection, t\(`sections\.\$\{activeAppSection\}\.label`/)
      expect(app).toMatch(/if \(previousAppSectionRef\.current === activeAppSection\) return/)
      expect(app).toMatch(/if \(getOpenDialogCount\(\) > 0\) return/)
      expect(i18n.t('navigation:skipToContent')).toBe('Hoppa till huvudinnehåll')
    })

    it('keeps the skip link hidden until focused, then clearly visible', () => {
      expect(accessibilityCss).toMatch(/\.skip-link \{[^}]*transform: translateY\(-200%\);/)
      expect(accessibilityCss).toMatch(/\.skip-link:focus,\s*\.skip-link:focus-visible \{\s*transform: none;\s*outline: 3px solid/)
    })
  })

  describe('touch targets', () => {
    it('gives small Home icon buttons an invisible 44 x 44 px hit area', () => {
      expect(accessibilityCss).toMatch(/\.overview-notification-button::after,[\s\S]*?\.smart-feed-controls button::after \{[^}]*width: 44px;[^}]*height: 44px;/)
    })

    it('raises short text buttons to 44 px', () => {
      expect(accessibilityCss).toMatch(/:root \.more-hub-back,\s*:root \.prompt-chip,\s*:root \.segmented-control button,[^{]*\{\s*min-height: 44px;/)
    })

    it('never lets "larger controls" shrink a control below its own design (A11Y-8B fix)', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-large-controls='true'\] :where\(button, \[role='button'\], summary, select,/)
      ;[['.ready-memory-grid button', 84], ['.smart-camera-mode-chip', 70], ['.wellbeing-section-toggle', 58], ['.wake-alarm-visual-actions button', 56], ['.accessibility-phrase-button', 52], ['.family-map-walkie button', 48]].forEach(([selector, height]) => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        expect(accessibilityCss).toMatch(new RegExp(`:root\\[data-a11y-large-controls='true'\\] :is\\([^)]*${escaped}[^{]*\\{\\s*min-height: ${height}px !important;`))
      })
    })

    it('gives the walkie-talkie buttons comfortable targets', () => {
      expect(accessibilityCss).toMatch(/\.family-map-walkie button \{\s*min-height: 48px;/)
    })
  })
})

