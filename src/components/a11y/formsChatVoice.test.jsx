/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AiCoachOverlay from '../AiCoachOverlay.jsx'
import BarcodeScanner from '../BarcodeScanner.jsx'
import ChatInput from '../ChatInput.jsx'
import ReminderSettings from '../ReminderSettings.jsx'
import AiCoachControls from '../aiCoach/AiCoachControls.jsx'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

function renderChatInput(props = {}) {
  const handlers = {
    onAiVoiceEnabledChange: vi.fn(),
    onChatInputChange: vi.fn(),
    onSendChatMessage: vi.fn((event) => event.preventDefault()),
    onStartVoiceInput: vi.fn(),
    onStopAiVoiceResponse: vi.fn(),
  }
  render(
    <ChatInput
      chatInput=""
      isAiSpeaking={false}
      isAiVoiceEnabled={false}
      isListening={false}
      isVoiceConversationActive={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

function renderControls(props = {}) {
  const handlers = {
    onClearChat: vi.fn(),
    onStartVoiceInput: vi.fn(),
    onStopAiVoiceResponse: vi.fn(),
    onToggleVoiceMute: vi.fn(),
  }
  const utils = render(
    <AiCoachControls
      canClearChat={false}
      isAiSpeaking={false}
      isListening={false}
      isVoiceConversationActive={false}
      isVoiceMuted={false}
      phaseLabel="Redo"
      {...handlers}
      {...props}
    />,
  )
  return { handlers, ...utils }
}

function renderOverlay(props = {}) {
  return render(
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
      onSendChatMessage={vi.fn()}
      onStartVoiceInput={vi.fn()}
      onStarterPrompt={vi.fn()}
      onStopAiVoiceResponse={vi.fn()}
      onToggleVoiceMute={vi.fn()}
      starterPrompts={[]}
      voiceStatus=""
      {...props}
    />,
  )
}

describe('forms, chat and voice accessibility (A11Y-8D)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  describe('ChatInput', () => {
    it('has a stable accessible name that does not depend on the placeholder', () => {
      renderChatInput()
      const field = screen.getByRole('textbox', { name: 'Fråga till AI Coach' })
      expect(field.getAttribute('placeholder')).toBe('Skriv en fråga...')
      expect(screen.getByLabelText('Fråga till AI Coach')).toBe(field)
    })

    it('is localized, including the accessible name, placeholder and buttons', async () => {
      await i18n.changeLanguage('en')
      renderChatInput()
      const field = screen.getByRole('textbox', { name: 'Question for AI Coach' })
      expect(field.getAttribute('placeholder')).toBe('Type a question...')
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Start voice conversation' })).toBeTruthy()
      expect(screen.getByRole('checkbox', { name: 'AI voice' })).toBeTruthy()
    })

    it('does not end an active voice conversation when the field gets focus', () => {
      const handlers = renderChatInput({ isVoiceConversationActive: true })
      const field = screen.getByRole('textbox', { name: 'Fråga till AI Coach' })

      field.focus()
      fireEvent.focus(field)
      expect(document.activeElement).toBe(field)
      expect(handlers.onStartVoiceInput).not.toHaveBeenCalled()

      fireEvent.change(field, { target: { value: 'Hur mycket protein?' } })
      expect(handlers.onChatInputChange).toHaveBeenCalledWith('Hur mycket protein?')
      expect(handlers.onStartVoiceInput).not.toHaveBeenCalled()
    })

    it('still ends the conversation through the explicit, named control', () => {
      const handlers = renderChatInput({ isVoiceConversationActive: true })
      const end = screen.getByRole('button', { name: 'Avsluta samtal' })
      expect(end.textContent).toBe('Avsluta samtal')

      fireEvent.click(end)
      expect(handlers.onStartVoiceInput).toHaveBeenCalledTimes(1)
    })

    it('names the idle voice button by its action and hides the emoji from screen readers', () => {
      renderChatInput()
      const start = screen.getByRole('button', { name: 'Starta röstsamtal' })
      expect(start.querySelector('[aria-hidden="true"]').textContent).toBe('🎙️')
    })

    it('has no hardcoded Swedish UI copy left in the component', () => {
      const chatSource = source('src/components/ChatInput.jsx')
      ;['Skriv en fråga', 'Skicka', 'Avsluta samtal', 'Starta röstsamtal', 'AI-röst'].forEach((copy) => {
        expect(chatSource).not.toContain(copy)
      })
      expect(chatSource).not.toContain('onFocus')
    })
  })

  describe('AI Coach voice controls', () => {
    it('names the main voice button by what it does in every state', () => {
      const { rerender, handlers } = renderControls()
      expect(screen.getByRole('button', { name: 'Tryck för att prata' })).toBeTruthy()

      rerender(<AiCoachControls {...handlers} canClearChat={false} isAiSpeaking={false} isListening isVoiceConversationActive isVoiceMuted={false} phaseLabel="Lyssnar..." />)
      expect(screen.queryByRole('button', { name: 'Lyssnar' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Avsluta samtal' })).toBeTruthy()

      rerender(<AiCoachControls {...handlers} canClearChat={false} isAiSpeaking isListening={false} isVoiceConversationActive isVoiceMuted={false} phaseLabel="AI pratar..." />)
      expect(screen.getAllByRole('button', { name: 'Avbryt svar' })[0].className).toContain('ai-coach-overlay-mic')
    })

    it('performs the named action: start, end, or stop the answer', () => {
      const idle = renderControls()
      fireEvent.click(screen.getByRole('button', { name: 'Tryck för att prata' }))
      expect(idle.handlers.onStartVoiceInput).toHaveBeenCalledTimes(1)
      cleanup()

      const active = renderControls({ isVoiceConversationActive: true, isListening: true })
      fireEvent.click(screen.getByRole('button', { name: 'Avsluta samtal' }))
      expect(active.handlers.onStartVoiceInput).toHaveBeenCalledTimes(1)
      cleanup()

      const speaking = renderControls({ isAiSpeaking: true, isVoiceConversationActive: true })
      fireEvent.click(screen.getAllByRole('button', { name: 'Avbryt svar' })[0])
      expect(speaking.handlers.onStopAiVoiceResponse).toHaveBeenCalledTimes(1)
      expect(speaking.handlers.onStartVoiceInput).not.toHaveBeenCalled()
    })

    it('shows the voice status as text in one polite status line, not only as colour or animation', () => {
      const { container, rerender, handlers } = renderControls({ isListening: true, isVoiceConversationActive: true, phaseLabel: 'Lyssnar...' })
      const status = screen.getByText('Lyssnar...')
      expect(status.getAttribute('aria-live')).toBe('polite')
      rerender(<AiCoachControls {...handlers} canClearChat={false} isAiSpeaking={false} isListening isVoiceConversationActive isVoiceMuted={false} phaseLabel="Lyssnar..." />)
      expect(container.querySelectorAll('[aria-live]')).toHaveLength(1)
      expect(screen.getByText('Lyssnar...')).toBe(status)
    })

    it('localizes the default voice phases shown in the overlay', async () => {
      renderOverlay({ isListening: true, isVoiceConversationActive: true })
      const dialog = screen.getByRole('dialog', { name: 'AI Coach' })
      expect(within(dialog).getByText('Lyssnar...').getAttribute('aria-live')).toBe('polite')
      cleanup()

      await i18n.changeLanguage('en')
      renderOverlay({ isVoiceConversationActive: true })
      expect(screen.getByText('Ready').getAttribute('aria-live')).toBe('polite')
      expect(screen.getByRole('button', { name: 'End call' })).toBeTruthy()
    })

    it('shows a runtime voice status message from the voice controller as text', () => {
      renderOverlay({ isVoiceConversationActive: true, voiceStatus: 'Mikrofonen är blockerad.' })
      expect(screen.getByText('Mikrofonen är blockerad.').getAttribute('aria-live')).toBe('polite')
    })
  })

  describe('form fields', () => {
    it('gives the manual barcode field an accessible name', () => {
      render(
        <BarcodeScanner
          barcodeInput=""
          barcodeScannerActive={false}
          barcodeStatus=""
          barcodeVideoRef={{ current: null }}
          onBarcodeInputChange={vi.fn()}
          onStartBarcodeScanner={vi.fn()}
          onStopBarcodeScanner={vi.fn()}
          onSubmitManualBarcode={vi.fn()}
          scannedProducts={[]}
        />,
      )
      const field = screen.getByRole('textbox', { name: 'Streckkod' })
      expect(field.getAttribute('placeholder')).toBe('Skriv streckkod manuellt')
    })

    it('names each reminder time field after its reminder and links its description', () => {
      render(
        <ReminderSettings
          onReminderSettingChange={vi.fn()}
          onRequestNotificationPermission={vi.fn()}
          reminderOptions={[
            { enabledKey: 'meal', label: 'Måltider', timeKey: 'mealTime' },
            { enabledKey: 'water', label: 'Vatten', timeKey: 'waterTime' },
          ]}
          reminderSettings={{ enabled: true, meal: true, mealTime: '12:00', water: false, waterTime: '15:00' }}
          reminderStatus=""
        />,
      )
      const mealTime = screen.getByLabelText('Tid för Måltider')
      const waterTime = screen.getByLabelText('Tid för Vatten')
      expect(mealTime.getAttribute('type')).toBe('time')
      expect(waterTime).not.toBe(mealTime)
      const description = document.getElementById(mealTime.getAttribute('aria-describedby'))
      expect(description.textContent).toBe(i18n.t('settings:reminders.descriptionMeal'))
    })

    it('names the Social board admin fields (rendered only for the admin account)', () => {
      const board = source('src/features/social/components/SocialBoard.jsx')
      expect(board).toMatch(/<input aria-label="Rubrik" type="text"/)
      expect(board).toMatch(/<textarea aria-label="Text på tavlan"/)
    })

    it('names the cloud backup rename field (inside an expanded backup row)', () => {
      const panel = source('src/components/CloudBackupPanel.jsx')
      expect(panel).toMatch(/<input\s+aria-label="Nytt namn för backupen"\s+type="text"\s+value=\{renameDrafts\[backup\.id\]/)
    })
  })

  describe('hardcoded UI copy guard', () => {
    it('reports no hardcoded UI copy in chat, voice controls and AI-örat', () => {
      const output = execFileSync(process.execPath, ['scripts/check-hardcoded-ui.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
      const checker = source('scripts/check-hardcoded-ui.mjs')
      ;['src/components/ChatInput.jsx', 'src/components/aiCoach/AiCoachControls.jsx', 'src/features/ai-ear/AiEarMode.jsx', 'src/features/ai-ear/aiEarViewModel.js'].forEach((file) => {
        expect(checker).toContain(`'${file}'`)
        expect(output).not.toContain(file)
      })
    })
  })
})
