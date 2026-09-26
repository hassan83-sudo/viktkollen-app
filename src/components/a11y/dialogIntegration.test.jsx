/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AiCoachOverlay from '../AiCoachOverlay.jsx'
import OverviewCoachStage from '../app/OverviewCoachStage.jsx'
import WeatherDayDetail from '../app/WeatherDayDetail.jsx'
import ReadySection from '../sections/ReadySection.jsx'
import SocialStage from '../../features/social/components/SocialStage.jsx'
import { getOpenDialogCount } from '../../services/accessibilityDialog.js'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

const weather = {
  city: 'Stockholm',
  condition: 'Sol',
  hasLiveWeather: true,
  hourly: [{ icon: '☀', precipitationRiskPercent: 0, temperatureC: 12, time: '2026-09-24T10:00', timeLabel: '10:00', uvIndex: null, windSpeedMs: 2 }],
  icon: '☀',
  precipitationRiskPercent: 0,
  sourceLabel: 'Open-Meteo',
  sunriseLabel: '06:50',
  sunsetLabel: '19:05',
  temperatureC: 12,
  updatedAt: '2026-09-24T10:00:00.000Z',
  windSpeedMs: 2,
}

const dialogs = {
  'AI Coach': {
    name: 'AI Coach',
    render: (onClose) => (
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
        onClose={onClose}
        onSendChatMessage={vi.fn()}
        onStartVoiceInput={vi.fn()}
        onStarterPrompt={vi.fn()}
        onStopAiVoiceResponse={vi.fn()}
        onToggleVoiceMute={vi.fn()}
        starterPrompts={[]}
        voiceStatus=""
      />
    ),
  },
  Weather: {
    name: 'Vädret idag',
    render: (onClose) => <WeatherDayDetail initialWeather={weather} onClose={onClose} />,
  },
  Social: {
    name: 'Vänner',
    render: (onClose) => <SocialStage enabled onClose={onClose} />,
  },
  'Coach stage': {
    name: 'Råd från din data',
    render: (onClose) => <OverviewCoachStage advice="Ät mer protein." onClose={onClose} onOpenCoach={vi.fn()} proteinGoal={120} proteinToday={60} />,
  },
}

function Opener({ renderDialog }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <main>
        <button type="button">Background</button>
        <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      </main>
      {open && renderDialog(() => setOpen(false))}
    </>
  )
}

function openDialog(renderDialog) {
  render(<Opener renderDialog={renderDialog} />)
  const opener = screen.getByRole('button', { name: 'Open dialog' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('dialog accessibility integration (A11Y-8C)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  describe.each(Object.entries(dialogs))('%s', (_, { name, render: renderDialog }) => {
    it('is a named modal dialog that takes focus and keeps Tab inside', () => {
      openDialog(renderDialog)
      const dialog = screen.getByRole('dialog', { name })
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.contains(document.activeElement)).toBe(true)

      for (let index = 0; index < 25; index += 1) {
        fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: index % 3 === 0 })
        expect(dialog.contains(document.activeElement)).toBe(true)
      }
    })

    it('makes the background inert while open', () => {
      openDialog(renderDialog)
      expect(screen.getByRole('button', { name: 'Background' }).closest('[inert]')).not.toBeNull()
      expect(screen.getByRole('dialog', { name }).closest('[inert]')).toBeNull()
    })

    it('closes on Escape and returns focus to the opener', () => {
      const opener = openDialog(renderDialog)
      fireEvent.keyDown(document.activeElement, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name })).toBeNull()
      expect(document.activeElement).toBe(opener)
      expect(document.querySelectorAll('[inert]')).toHaveLength(0)
      expect(getOpenDialogCount()).toBe(0)
    })
  })

  describe('Ready', () => {
    function openReadyDialog(buttonName) {
      render(<ReadySection activeSection="redo" onNavigateSection={vi.fn()} />)
      const opener = screen.getByRole('button', { name: buttonName })
      opener.focus()
      fireEvent.click(opener)
      return opener
    }

    it.each([
      // Named by its visible heading (aria-labelledby).
      [/Minnesträning/, 'Alla tekniker'],
      [/AI Ögat/, 'AI Ögat'],
    ])('opens %s as a named modal with focus, trap, Escape and focus return', (buttonName, dialogName) => {
      const opener = openReadyDialog(buttonName)
      const dialog = screen.getByRole('dialog', { name: dialogName })
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.contains(document.activeElement)).toBe(true)
      for (let index = 0; index < 10; index += 1) {
        fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: index % 2 === 1 })
        expect(dialog.contains(document.activeElement)).toBe(true)
      }
      fireEvent.keyDown(document.activeElement, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: dialogName })).toBeNull()
      expect(document.activeElement).toBe(opener)
    })
  })

  describe('Place', () => {
    const placeSource = source('src/components/sections/PlaceSection.jsx')

    it('renders every Place modal through the shared ModalDialog with its existing close callback', () => {
      expect(placeSource).not.toContain('role="dialog"')
      const modals = placeSource.match(/<ModalDialog .*?Open\(false\)\}>/g)
      expect(modals).toHaveLength(9)
      modals.forEach((tag) => {
        expect(tag).toMatch(/aria-label=/)
        expect(tag).toMatch(/onClose=\{\(\) => setIs[A-Za-z]+Open\(false\)\}/)
      })
    })

    it('never lets Escape interrupt a safety alert that is being sent, and does not auto-focus an alert action', () => {
      // A11Y-8Z2: the dialog name comes from i18n (place:safetyAlert.title).
      const sos = placeSource.match(/<ModalDialog [^\n]*aria-label=\{t\('safetyAlert\.title'\)\}[^\n]*>/)[0]
      expect(sos).toContain('closeOnEscape={!safetyAlertSending}')
      expect(sos).toContain('initialFocus="dialog"')
    })
  })

  describe('scope', () => {
    it('leaves Smart Camera and Body Scan dialogs untouched', () => {
      ;['src/features/smart-camera/components/SmartCameraStage.jsx', 'src/components/app/HomeBodyScanStage.jsx', 'src/components/app/OverviewBodyScanStage.jsx', 'src/components/BodyAnalysisVideoScanner.jsx'].forEach((path) => {
        expect(source(path)).not.toContain('useDialogA11y')
        expect(source(path)).not.toContain('ModalDialog')
      })
    })
  })
})
