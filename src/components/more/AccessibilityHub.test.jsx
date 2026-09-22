/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import AccessibilityHub from './AccessibilityHub.jsx'
import MoreHub from './MoreHub.jsx'

const appCss = readFileSync(resolve(process.cwd(), 'src', 'App.css'), 'utf8')

const sectionTitles = [
  'Syn',
  'Hörsel',
  'Tal & kommunikation',
  'Motorik',
  'Läsning',
  'Kognitivt stöd',
  'Enkelt läge',
  'Äldre',
]

function renderAccessibilityHub({ onBack = vi.fn(), onOpenEar = vi.fn(), onOpenEye = vi.fn() } = {}) {
  return render(
    <MoreHub activeFolder="accessibility" onBack={onBack}>
      <AccessibilityHub onOpenEar={onOpenEar} onOpenEye={onOpenEye} />
    </MoreHub>,
  )
}

describe('AccessibilityHub', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel: vi.fn(), speak: vi.fn() },
    })
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
  })

  afterEach(() => {
    cleanup()
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  it('opens the dedicated accessibility hub from More with all eight sections', () => {
    renderAccessibilityHub()

    expect(screen.getByRole('heading', { name: 'Tillgänglighet & hjälpmedel' })).toBeTruthy()
    sectionTitles.forEach((title) => {
      expect(screen.getByRole('button', { name: new RegExp(`^${title}`) })).toBeTruthy()
    })
    screen.getAllByRole('button').forEach((button) => {
      expect(button.getAttribute('aria-label') || button.textContent.trim()).not.toBe('')
    })
  })

  it('opens every coming-later detail and returns to the accessibility hub', () => {
    renderAccessibilityHub()

    sectionTitles.forEach((title) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }))

      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeTruthy()
      expect(screen.getByRole('status').textContent).toBe('Kommer senare')

      fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
      const sectionButton = screen.getByRole('button', { name: new RegExp(`^${title}`) })
      expect(sectionButton).toBeTruthy()
    })
  })

  it('returns focus to the section card after navigating back', () => {
    renderAccessibilityHub()
    const speech = screen.getByRole('button', { name: /^Tal & kommunikation/ })

    fireEvent.click(speech)
    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Tal & kommunikation/ }))
  })

  it('keeps the planned focus narration item visible in the accessibility hub', () => {
    renderAccessibilityHub()

    expect(screen.getByRole('heading', { name: 'Berätta vad jag markerar' })).toBeTruthy()
    expect(screen.getByText('Framtida stöd för att beskriva vad som får fokus. Ingen uppläsning eller markering sker ännu.')).toBeTruthy()
  })

  it('returns to the More hub from the accessibility hub', () => {
    const onBack = vi.fn()
    renderAccessibilityHub({ onBack })

    fireEvent.click(screen.getByRole('button', { name: '← Tillbaka' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('opens the existing AI Eye from the vision detail', () => {
    const onOpenEye = vi.fn()
    renderAccessibilityHub({ onOpenEye })

    fireEvent.click(screen.getByRole('button', { name: /^Syn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Ögat' }))

    expect(onOpenEye).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Kommer senare')
  })

  it('opens the existing AI Ear from the hearing detail', () => {
    const onOpenEar = vi.fn()
    renderAccessibilityHub({ onOpenEar })

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Örat' }))

    expect(onOpenEar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Kommer senare')
  })

  it('offers local reading previews without changing the rest of the app', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Läsning/ }))

    const largerText = screen.getByRole('button', { name: 'Större text' })
    ;['Extra stor text', 'Tydligare text', 'Mer radavstånd', 'Förenklade texter'].forEach((label) => {
      expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Läs upp text')).toBeTruthy()

    fireEvent.click(largerText)

    expect(largerText.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Det här är en lokal förhandsvisning. Den ändrar bara texten i den här tillgänglighetsvyn.')).toBeTruthy()
    expect(screen.getByText('Uppläsning förbereds för framtiden. Ingen extern tjänst eller AI används här.')).toBeTruthy()
  })

  it('shows cognitive support cards and a contained step-by-step example', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Kognitivt stöd/ }))

    ;['Korta instruktioner', 'Steg-för-steg', 'Färre val åt gången', 'Tydliga bekräftelser', 'Minnesstöd', 'Förutsägbar navigation', 'Bilder/symboler som stöd'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy()
    })
    expect(screen.getByRole('heading', { name: 'Ett steg i taget' })).toBeTruthy()
    expect(screen.getByText('Välj vad du vill göra.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Nästa' }))
    expect(screen.getByText('Läs den korta bekräftelsen.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tillbaka' }))
    expect(screen.getByText('Välj vad du vill göra.')).toBeTruthy()
    expect(screen.getByText('Påminn mig var jag var')).toBeTruthy()
  })

  it('toggles the local simple mode preview on and off', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Enkelt läge/ }))
    const previewButton = screen.getByRole('button', { name: 'Förhandsvisa enkelt läge' })

    previewButton.focus()
    expect(document.activeElement).toBe(previewButton)

    fireEvent.click(previewButton)

    expect(screen.getByRole('button', { name: 'Avsluta förhandsvisning' }).getAttribute('aria-pressed')).toBe('true')
    ;['Större knappar', 'Kortare texter', 'Färre val åt gången', 'Tydliga symboler', 'Ett steg i taget', 'Lugnare gränssnitt'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Avsluta förhandsvisning' }))

    expect(screen.getByRole('button', { name: 'Förhandsvisa enkelt läge' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByText('Lugnare gränssnitt')).toBeNull()
  })

  it('retains planned support lists while exposing scoped motor and senior settings', () => {
    renderAccessibilityHub()

    const plannedSections = {
      Motorik: ['Stora tryckytor', 'Färre precisa gester', 'Tangentbord', 'Switch/hjälpmedelsknapp', 'Röststyrning', 'Extra tid för interaktion'],
      Äldre: ['Större text', 'Större knappar', 'Förenklad navigation', 'Uppläsning', 'Tydligare kontrast', 'Påminnelsestöd'],
    }

    Object.entries(plannedSections).forEach(([section, labels]) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${section}`) }))
      labels.forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0))
      expect(screen.getByRole('status').textContent).toBe('Kommer senare')
      fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    })
  })

  it('persists scoped reading settings and resets only the accessibility key', () => {
    window.localStorage.setItem('unrelated-key', 'keep')
    window.confirm = vi.fn(() => true)
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Läsning/ }))
    const largeText = screen.getByRole('button', { name: 'Stor text' })
    fireEvent.click(largeText)
    expect(largeText.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"textSize":"large"')

    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Återställ tillgänglighetsinställningar' }))
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toBeNull()
    expect(window.localStorage.getItem('unrelated-key')).toBe('keep')
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Inställningarna återställdes')).toBe(true)
  })

  it('uses native pressed buttons for motor settings and optional haptic confirmations', () => {
    const vibrate = vi.fn()
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    const haptics = screen.getByRole('button', { name: 'Vibration vid viktiga tryck' })
    fireEvent.click(haptics)
    expect(haptics.getAttribute('aria-pressed')).toBe('true')
    expect(vibrate).toHaveBeenCalledWith(15)

    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Motorik/ }))
    const controls = screen.getByRole('button', { name: 'Större knappar och tryckytor' })
    fireEvent.click(controls)
    expect(controls.getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps haptic confirmation safe when vibration is unsupported', () => {
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: undefined })
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vibration vid viktiga tryck' }))

    expect(screen.getByRole('button', { name: 'Vibration vid viktiga tryck' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('lets individual senior settings override the extra clear package', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Äldre/ }))
    const packageButton = screen.getByRole('button', { name: 'Extra tydligt läge' })
    fireEvent.click(packageButton)
    expect(packageButton.getAttribute('aria-pressed')).toBe('true')

    const largerText = screen.getByRole('button', { name: 'Större text' })
    fireEvent.click(largerText)
    expect(largerText.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Extra tydligt läge' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps extra-large text and preference controls responsive at 390px and 430px', () => {
    expect(appCss).toContain('@media (max-width: 430px)')
    expect(appCss).toContain('.accessibility-scope.is-text-extra-large')
    expect(appCss).toContain('--accessibility-text-scale: 1.16;')
    expect(appCss).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(appCss).toContain('flex-basis: 100%')
    expect(appCss).toContain('.accessibility-feedback')
    expect(appCss).toContain('.accessibility-scope.has-high-contrast .accessibility-feedback')
    expect(appCss).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('keeps navigation speech off until explicitly enabled and persists a bounded rate', () => {
    renderAccessibilityHub()
    const hub = screen.getByLabelText('Tillgänglighet & hjälpmedel')
    const vision = screen.getByRole('button', { name: /^Syn/ })

    fireEvent.keyDown(hub, { key: 'Tab' })
    fireEvent.focus(vision)
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Navigationsuppläsning' }))
    fireEvent.click(screen.getByRole('button', { name: 'Snabb' }))
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"navigationSpeech":true')
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"navigationSpeechRate":"fast"')
  })

  it('speaks keyboard focus once, cancels stale navigation speech, and ignores pointer focus', () => {
    renderAccessibilityHub()
    const hub = screen.getByLabelText('Tillgänglighet & hjälpmedel')
    const vision = screen.getByRole('button', { name: /^Syn/ })
    const hearing = screen.getByRole('button', { name: /^Hörsel/ })
    const speech = screen.getByRole('button', { name: /^Tal & kommunikation/ })
    const navigationToggle = screen.getByRole('button', { name: 'Navigationsuppläsning' })

    fireEvent.click(navigationToggle)
    fireEvent.focus(vision)
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()

    fireEvent.keyDown(hub, { key: 'Tab' })
    fireEvent.focus(vision)
    fireEvent.focus(vision)
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(window.speechSynthesis.speak.mock.calls[0][0].text).toContain('Syn')

    fireEvent.focus(hearing)
    fireEvent.focus(speech)
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(3)
    expect(window.speechSynthesis.speak.mock.calls[2][0].text).toContain('Tal & kommunikation')
    expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(3)
  })

  it('arbitrates navigation and manual communication speech through one browser queue', () => {
    renderAccessibilityHub()
    const hub = screen.getByLabelText('Tillgänglighet & hjälpmedel')
    const speechSection = screen.getByRole('button', { name: /^Tal & kommunikation/ })

    fireEvent.click(screen.getByRole('button', { name: 'Navigationsuppläsning' }))
    fireEvent.keyDown(hub, { key: 'Tab' })
    fireEvent.focus(speechSection)
    const navigationUtterance = window.speechSynthesis.speak.mock.calls[0][0]

    fireEvent.click(speechSection)
    fireEvent.click(screen.getByRole('button', { name: 'Ja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Läs upp' }))
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(2)
    expect(window.speechSynthesis.speak.mock.calls[1][0].text).toBe('Ja')
    act(() => navigationUtterance.onend())
    expect(screen.getByText('Läser upp').closest('[role="status"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    fireEvent.keyDown(screen.getByLabelText('Tillgänglighet & hjälpmedel'), { key: 'Tab' })
    fireEvent.focus(screen.getByRole('button', { name: /^Syn/ }))
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(4)
    expect(window.speechSynthesis.cancel.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps navigation feedback visible with speech disabled and deduplicates repeated focus', () => {
    renderAccessibilityHub()
    const hub = screen.getByLabelText('Tillgänglighet & hjälpmedel')
    const vision = screen.getByRole('button', { name: /^Syn/ })

    fireEvent.click(screen.getByRole('button', { name: 'Navigationsuppläsning' }))
    fireEvent.keyDown(hub, { key: 'Tab' })
    fireEvent.focus(vision)
    fireEvent.focus(vision)

    expect(screen.getAllByRole('status').filter((status) => status.textContent === 'Läser upp')).toHaveLength(1)
    act(() => window.speechSynthesis.speak.mock.calls[0][0].onend())
    expect(screen.getByText('Klar').closest('[role="status"]')).toBeTruthy()

    delete window.speechSynthesis
    fireEvent.focus(screen.getByRole('button', { name: /^Hörsel/ }))
    expect(screen.getByText('Uppläsning stöds inte på den här enheten. Du kan fortsätta använda kontrollerna.').closest('[role="status"]')).toBeTruthy()
  })
})
