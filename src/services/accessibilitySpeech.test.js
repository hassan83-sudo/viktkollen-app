/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SPEECH_LENGTH,
  MAX_SPEECH_SEGMENT_LENGTH,
  cancelAccessibilitySpeech,
  getAccessibilitySpeechLocale,
  getAccessibilitySpeechRate,
  getNavigationSpeechLabel,
  speakAccessibilityText,
  splitAccessibilitySpeechText,
} from './accessibilitySpeech.js'

describe('accessibility speech', () => {
  let speechSynthesis

  beforeEach(() => {
    speechSynthesis = { cancel: vi.fn(), speak: vi.fn() }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speechSynthesis })
    globalThis.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
      this.text = text
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete window.speechSynthesis
    delete globalThis.SpeechSynthesisUtterance
  })

  it('uses the documented label priority and bounded text', () => {
    document.body.innerHTML = '<button aria-label="Aria" aria-labelledby="named" data-a11y-speech-label="Explicit">Visible</button><span id="named">Labelled</span>'
    expect(getNavigationSpeechLabel(document.querySelector('button'), { fallback: 'Fallback' })).toBe('Explicit')

    const button = document.querySelector('button')
    delete button.dataset.a11ySpeechLabel
    expect(getNavigationSpeechLabel(button, { fallback: 'Fallback' })).toBe('Aria')
    button.removeAttribute('aria-label')
    expect(getNavigationSpeechLabel(button, { fallback: 'Fallback' })).toBe('Labelled')

    document.body.innerHTML = `<button>${'Long label '.repeat(30)}</button>`
    expect(getNavigationSpeechLabel(document.querySelector('button'), { fallback: 'Fallback' }).length).toBe(MAX_SPEECH_LENGTH)
  })

  it('excludes hidden content and never includes input values', () => {
    document.body.innerHTML = '<button aria-hidden="true">Hidden</button><button>Visible <span aria-hidden="true">secret</span><style>secret-style</style></button><label>Private note<textarea data-a11y-private>secret health note</textarea></label><label>Password<input type="password" value="secret"></label>'
    expect(getNavigationSpeechLabel(document.querySelector('button'), { fallback: 'Fallback' })).toBe('')
    expect(getNavigationSpeechLabel(document.querySelectorAll('button')[1], { fallback: 'Fallback' })).toBe('Visible')
    expect(getNavigationSpeechLabel(document.querySelector('textarea'), { fallback: 'Fallback', states: { input: 'input' } })).toBe('Private note. input')
    expect(getNavigationSpeechLabel(document.querySelector('input'), { fallback: 'Fallback', states: { password: 'password field' } })).toBe('Password. password field')
  })

  it('maps supported language and bounded rate choices safely', () => {
    expect(getAccessibilitySpeechLocale('sv')).toBe('sv-SE')
    expect(getAccessibilitySpeechLocale('en-GB')).toBe('en-US')
    expect(getAccessibilitySpeechLocale('unknown')).toBe('en-US')
    expect(getAccessibilitySpeechRate('slow')).toBe(0.8)
    expect(getAccessibilitySpeechRate('fast')).toBe(1.2)
    expect(getAccessibilitySpeechRate('invalid')).toBe(1)
  })

  it('uses browser speech only and cancels queued speech before the current utterance', () => {
    expect(speakAccessibilityText({ language: 'sv', rate: 'fast', text: 'Hej' })).toBe(true)
    expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(speechSynthesis.speak.mock.calls[0][0]).toMatchObject({ text: 'Hej', lang: 'sv-SE', rate: 1.2 })
  })

  it('adds concise control states when supplied', () => {
    document.body.innerHTML = '<button aria-pressed="true">Contrast</button><button aria-expanded="false">Details</button><button aria-checked="true">Choice</button><button aria-selected="false">Tab</button><button disabled>Disabled</button>'
    const states = {
      checked: 'checked', collapsed: 'collapsed', disabled: 'disabled', notSelected: 'not selected', pressed: 'on',
    }
    expect(getNavigationSpeechLabel(document.querySelector('button'), { states })).toBe('Contrast. on')
    expect(getNavigationSpeechLabel(document.querySelector('[aria-expanded]'), { states })).toBe('Details. collapsed')
    expect(getNavigationSpeechLabel(document.querySelector('[aria-checked]'), { states })).toBe('Choice. checked')
    expect(getNavigationSpeechLabel(document.querySelector('[aria-selected]'), { states })).toBe('Tab. not selected')
    expect(getNavigationSpeechLabel(document.querySelector('[disabled]'), { states })).toBe('Disabled. disabled')
  })

  // A11Y-8A: long text is spoken completely, in ordered segments.
  describe('long text read-aloud (A11Y-8A)', () => {
    const longText = 'Jag behöver hjälp med att hitta rätt dörr till mottagningen. Kan du visa mig vägen dit och vänta med mig en stund? Jag har svårt att prata men hör allt ni säger till mig, tack så mycket.'
    const spokenText = () => speechSynthesis.speak.mock.calls.map(([utterance]) => utterance.text)
    const lastUtterance = () => speechSynthesis.speak.mock.calls.at(-1)[0]

    function finishAllSegments() {
      let guard = 0
      while (guard < 20) {
        const before = speechSynthesis.speak.mock.calls.length
        lastUtterance().onend()
        if (speechSynthesis.speak.mock.calls.length === before) return
        guard += 1
      }
    }

    it('keeps short text as one utterance', () => {
      const onEnd = vi.fn()
      speakAccessibilityText({ language: 'sv', text: 'Ja', onEnd })
      expect(spokenText()).toEqual(['Ja'])
      lastUtterance().onend()
      expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('splits text over 160 characters at word boundaries without losing any text', () => {
      expect(longText.length).toBeGreaterThan(MAX_SPEECH_SEGMENT_LENGTH)
      const segments = splitAccessibilitySpeechText(longText)
      expect(segments.length).toBeGreaterThan(1)
      segments.forEach((segment) => expect(segment.length).toBeLessThanOrEqual(MAX_SPEECH_SEGMENT_LENGTH))
      expect(segments.join(' ')).toBe(longText)
      segments.forEach((segment) => expect(longText.split(' ')).toEqual(expect.arrayContaining(segment.split(' '))))
    })

    it('reads a full 280-character message, in order, and reports completion only after the last segment', () => {
      const maxMessage = `${'Jag vill ha vatten nu '.repeat(13)}tack!`.slice(0, 280)
      expect(maxMessage.length).toBe(280)
      const onEnd = vi.fn()

      speakAccessibilityText({ language: 'sv', rate: 'slow', text: maxMessage, onEnd })
      expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
      expect(lastUtterance()).toMatchObject({ lang: 'sv-SE', rate: 0.8 })

      lastUtterance().onend()
      expect(onEnd).not.toHaveBeenCalled()
      finishAllSegments()

      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(spokenText().join(' ')).toBe(maxMessage.replace(/\s+/g, ' ').trim())
      speechSynthesis.speak.mock.calls.forEach(([utterance]) => expect(utterance).toMatchObject({ lang: 'sv-SE', rate: 0.8 }))
    })

    it('stops the whole sequence on cancel', () => {
      const onEnd = vi.fn()
      speakAccessibilityText({ language: 'sv', text: longText, onEnd })
      const first = lastUtterance()

      cancelAccessibilitySpeech()
      first.onend()

      expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
      expect(onEnd).not.toHaveBeenCalled()
    })

    it('lets a new read-aloud replace an old one without the old callbacks finishing it', () => {
      const oldEnd = vi.fn()
      const oldError = vi.fn()
      const newEnd = vi.fn()
      speakAccessibilityText({ language: 'sv', text: longText, onEnd: oldEnd, onError: oldError })
      const oldUtterance = lastUtterance()

      speakAccessibilityText({ language: 'sv', text: 'Ny text', onEnd: newEnd })
      oldUtterance.onend()
      oldUtterance.onerror()

      expect(spokenText()).toEqual([splitAccessibilitySpeechText(longText)[0], 'Ny text'])
      expect(oldEnd).not.toHaveBeenCalled()
      expect(oldError).not.toHaveBeenCalled()
      expect(newEnd).not.toHaveBeenCalled()

      lastUtterance().onend()
      expect(newEnd).toHaveBeenCalledTimes(1)
    })

    it('ends the sequence on an error and reports it once', () => {
      const onEnd = vi.fn()
      const onError = vi.fn()
      speakAccessibilityText({ language: 'sv', text: longText, onEnd, onError })

      lastUtterance().onerror()
      lastUtterance().onend()

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onEnd).not.toHaveBeenCalled()
      expect(speechSynthesis.speak).toHaveBeenCalledTimes(1)
    })
  })
})
