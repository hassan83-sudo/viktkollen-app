import { describe, expect, it, vi } from 'vitest'
import { supportedLanguageCodes } from '../i18n/languages.js'
import { createVoiceConversationController, getSpeechLocale, selectSpeechSynthesisVoice } from './voiceConversationController.js'

// A11Y-8Z2 (8T/8Y B10): speech recognition, and the synthesis voice and
// fallback, follow the app language instead of always sv-SE.

function recognitionClass() {
  const instances = []
  class FakeRecognition {
    constructor() {
      this.handlers = {}
      this.start = vi.fn(() => this.handlers.start?.())
      this.abort = vi.fn()
      this.stop = vi.fn()
      instances.push(this)
    }

    addEventListener(type, handler) {
      this.handlers[type] = handler
    }
  }
  FakeRecognition.instances = instances
  return FakeRecognition
}

async function recognitionLangFor(language) {
  const Recognition = recognitionClass()
  const controller = createVoiceConversationController({
    getLanguage: () => language,
    getMediaDevices: () => ({ getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) }),
    getScope: () => ({ SpeechRecognition: Recognition }),
    hostname: () => 'localhost',
    isSecureContext: () => true,
    onTranscript: vi.fn(async () => ''),
  })
  await controller.start()
  controller.stop?.()
  return Recognition.instances[0]?.lang
}

describe('speech language follows the app language (B10)', () => {
  it('maps the app languages to speech locales', () => {
    expect(getSpeechLocale('sv')).toBe('sv-SE')
    expect(getSpeechLocale('en')).toBe('en-US')
    expect(getSpeechLocale('no')).toBe('nb-NO')
    expect(getSpeechLocale('zh-TW')).toBe('zh-TW')
    expect(getSpeechLocale('ja')).toBe('ja-JP')
  })

  it('every supported app language gets a valid tag; unknown or missing falls back to the default language (sv-SE)', () => {
    for (const code of supportedLanguageCodes) {
      expect(getSpeechLocale(code), code).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/)
      expect(getSpeechLocale(code).split('-')[0], code).toBe(code === 'no' ? 'nb' : code.split('-')[0])
    }
    expect(getSpeechLocale('cs')).toBe('cs')
    expect(getSpeechLocale('')).toBe('sv-SE')
    expect(getSpeechLocale(undefined)).toBe('sv-SE')
    expect(getSpeechLocale('xx')).toBe('sv-SE')
  })

  it('speech recognition uses the app language: sv -> sv-SE, en -> en-US, missing -> sv-SE', async () => {
    expect(await recognitionLangFor('sv')).toBe('sv-SE')
    expect(await recognitionLangFor('en')).toBe('en-US')
    expect(await recognitionLangFor('de')).toBe('de-DE')
    expect(await recognitionLangFor('')).toBe('sv-SE')
  })

  it('the synthesis voice follows the app language and keeps Swedish as the default', () => {
    const swedish = { default: true, lang: 'sv-SE', name: 'Svenska' }
    const english = { default: false, lang: 'en-GB', name: 'English' }
    expect(selectSpeechSynthesisVoice([swedish, english], 'nova', 'en')).toBe(english)
    expect(selectSpeechSynthesisVoice([swedish, english], 'nova', 'sv')).toBe(swedish)
    expect(selectSpeechSynthesisVoice([english, swedish])).toBe(swedish)
    // No voice in the language: the default voice.
    expect(selectSpeechSynthesisVoice([swedish, english], 'nova', 'fi')).toBe(swedish)
  })
})
