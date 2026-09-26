/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
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

  it('opens every detail and returns to the accessibility hub', () => {
    renderAccessibilityHub()
    // A11Y-8A: "Kommer senare" only labels genuinely planned support lists,
    // never a working section, and is never announced as a live status.
    const sectionsWithPlannedSupport = ['Motorik', 'Äldre']

    sectionTitles.forEach((title) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }))

      expect(screen.getByRole('heading', { name: title, level: 2 })).toBeTruthy()
      expect(screen.queryAllByRole('status').some((status) => status.textContent === 'Kommer senare')).toBe(false)
      if (sectionsWithPlannedSupport.includes(title)) {
        expect(screen.getByRole('list', { name: 'Kommer senare' })).toBeTruthy()
      } else {
        expect(screen.queryByText('Kommer senare')).toBeNull()
      }

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
    // A working section is never labelled as coming later.
    expect(screen.queryByText('Kommer senare')).toBeNull()
  })

  it('opens the existing AI Ear from the hearing detail', () => {
    const onOpenEar = vi.fn()
    renderAccessibilityHub({ onOpenEar })

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Örat' }))

    expect(onOpenEar).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Kommer senare')).toBeNull()
  })

  it('does not crash the hub when onOpenEar/onOpenEye are not supplied (A11Y-5H1)', () => {
    render(
      <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
        <AccessibilityHub />
      </MoreHub>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Örat' }))).not.toThrow()

    fireEvent.click(screen.getByRole('button', { name: '← Till Tillgänglighet & hjälpmedel' }))
    fireEvent.click(screen.getByRole('button', { name: /^Syn/ }))
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Öppna AI Ögat' }))).not.toThrow()
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

    // A11Y-8A: only support that is not implemented yet stays in the planned
    // list; large targets, larger text, larger buttons and clearer contrast
    // already work through the preferences and are no longer listed.
    const plannedSections = {
      Motorik: {
        planned: ['Färre precisa gester', 'Tangentbord', 'Switch/hjälpmedelsknapp', 'Röststyrning', 'Extra tid för interaktion'],
        working: ['Stora tryckytor'],
      },
      Äldre: {
        planned: ['Förenklad navigation', 'Uppläsning', 'Påminnelsestöd'],
        working: ['Större knappar', 'Tydligare kontrast'],
      },
    }

    Object.entries(plannedSections).forEach(([section, { planned, working }]) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${section}`) }))
      const plannedList = screen.getByRole('list', { name: 'Kommer senare' })
      planned.forEach((label) => expect(plannedList.textContent).toContain(label))
      working.forEach((label) => {
        expect(Array.from(plannedList.querySelectorAll('li')).some((item) => item.textContent === label)).toBe(false)
      })
      fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    })
  })

  it('persists scoped reading settings and resets only the accessibility key', () => {
    window.localStorage.setItem('unrelated-key', 'keep')
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Läsning/ }))
    const largeText = screen.getByRole('button', { name: 'Stor text' })
    fireEvent.click(largeText)
    expect(largeText.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"textSize":"large"')

    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    // A11Y-8X6: the reset asks in ConfirmDialog; Avbryt keeps the setting.
    const reset = screen.getByRole('button', { name: 'Återställ tillgänglighetsinställningar' })
    fireEvent.click(reset)
    let dialog = screen.getByRole('alertdialog', { name: 'Återställ tillgänglighetsinställningar' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"textSize":"large"')
    fireEvent.click(reset)
    dialog = screen.getByRole('alertdialog', { name: 'Återställ tillgänglighetsinställningar' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Återställ' }))
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

  it('opens the shared accessibility setup from a prominent Anpassa Viktkollen action and returns focus on back (A11Y-7C)', () => {
    renderAccessibilityHub()
    const trigger = screen.getByRole('button', { name: 'Anpassa Viktkollen' })

    fireEvent.click(trigger)

    expect(screen.getByRole('button', { name: 'Tydligare kontrast' })).toBeTruthy()
    // The real setup, not a placeholder - no "coming later" status here.
    expect(screen.queryByText('Kommer senare')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))
    expect(window.localStorage.getItem('viktkollen.accessibility.preferences.v1')).toContain('"textSize":"large"')

    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anpassa Viktkollen' }))
  })

  it('finishing the shared setup from the hub returns to the hub screen', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: 'Anpassa Viktkollen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Klart' }))

    expect(screen.getByRole('heading', { name: 'Tillgänglighet & hjälpmedel' })).toBeTruthy()
  })

  it('keeps a change made in the shared setup when a hub setting changes afterwards (A11Y-8A regression)', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: 'Anpassa Viktkollen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Klart' }))

    fireEvent.click(screen.getByRole('button', { name: 'Navigationsuppläsning' }))

    const stored = JSON.parse(window.localStorage.getItem('viktkollen.accessibility.preferences.v1'))
    expect(stored.navigationSpeech).toBe(true)
    expect(stored.textSize).toBe('large')

    fireEvent.click(screen.getByRole('button', { name: /^Läsning/ }))
    expect(screen.getByRole('button', { name: 'Stor text' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps an earlier hub change when the shared setup saves a later one', () => {
    renderAccessibilityHub()

    fireEvent.click(screen.getByRole('button', { name: /^Syn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Minska animationer' }))
    fireEvent.click(screen.getByRole('button', { name: /Till Tillgänglighet & hjälpmedel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Anpassa Viktkollen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extra stor text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Klart' }))
    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tydligare markering' }))

    const stored = JSON.parse(window.localStorage.getItem('viktkollen.accessibility.preferences.v1'))
    expect(stored).toMatchObject({ reduceMotion: true, textSize: 'extra-large', visualFeedback: true })
  })

  it('vibrates exactly once per haptic change, also under StrictMode', () => {
    const vibrate = vi.fn()
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: vibrate })
    render(
      <StrictMode>
        <MoreHub activeFolder="accessibility" onBack={vi.fn()}>
          <AccessibilityHub />
        </MoreHub>
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Hörsel/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vibration vid viktiga tryck' }))

    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(15)
  })

  it('keeps the settings status region mounted and re-announces a repeated confirmation', () => {
    renderAccessibilityHub()
    const hub = screen.getByLabelText('Tillgänglighet & hjälpmedel')
    const regionsBefore = within(hub).getAllByRole('status')
    expect(regionsBefore.length).toBeGreaterThan(0)
    regionsBefore.forEach((region) => {
      expect(region.textContent).toBe('')
      expect(region.getAttribute('aria-live')).toBe('polite')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    const region = within(hub).getAllByRole('status').find((status) => status.textContent === 'Inställningen uppdaterades.')
    expect(regionsBefore).toContain(region)
    const firstMessageNode = region.firstChild

    fireEvent.click(screen.getByRole('button', { name: 'Snabb' }))
    expect(region.textContent).toBe('Inställningen uppdaterades.')
    expect(region.firstChild).not.toBe(firstMessageNode)
  })

  it('uses a labelled group for the speech-rate choices and keeps the text-size legend unduplicated in setup', () => {
    renderAccessibilityHub()
    expect(screen.getByRole('group', { name: 'Uppläsningshastighet' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Anpassa Viktkollen' }))
    expect(screen.getAllByRole('group', { name: 'Textstorlek' })).toHaveLength(1)
  })
})
