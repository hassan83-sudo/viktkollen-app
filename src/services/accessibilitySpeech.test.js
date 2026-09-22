/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SPEECH_LENGTH,
  getAccessibilitySpeechLocale,
  getAccessibilitySpeechRate,
  getNavigationSpeechLabel,
  speakAccessibilityText,
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
})
