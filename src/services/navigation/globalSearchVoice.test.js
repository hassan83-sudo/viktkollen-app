import { describe, expect, it } from 'vitest'
import {
  getSpeechRecognitionConstructor,
  isFinalSpeechResult,
  mapSpeechRecognitionError,
  pickSpeechTranscript,
  resolveSpeechRecognitionLanguage,
} from './globalSearchVoice.js'

describe('globalSearchVoice', () => {
  it('prefers standard SpeechRecognition then webkitSpeechRecognition', () => {
    const Standard = function Standard() {}
    const Webkit = function Webkit() {}
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: Standard, webkitSpeechRecognition: Webkit })).toBe(Standard)
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: Webkit })).toBe(Webkit)
    expect(getSpeechRecognitionConstructor({})).toBeNull()
  })

  it('maps known app locales and falls back without guessing unknown codes', () => {
    expect(resolveSpeechRecognitionLanguage('sv')).toBe('sv-SE')
    expect(resolveSpeechRecognitionLanguage('en')).toBe('en-US')
    expect(resolveSpeechRecognitionLanguage('unknown-locale')).toBe('sv-SE')
  })

  it('uses the first alternative of the latest result', () => {
    const event = {
      results: [
        [{ transcript: '  Min   resa  ' }],
      ],
    }
    event.results[0].isFinal = true
    expect(pickSpeechTranscript(event)).toBe('Min resa')
    expect(isFinalSpeechResult(event)).toBe(true)
  })

  it('maps browser recognition errors to user-facing codes', () => {
    expect(mapSpeechRecognitionError('not-allowed')).toBe('permission')
    expect(mapSpeechRecognitionError('no-speech')).toBe('noSpeech')
    expect(mapSpeechRecognitionError('audio-capture')).toBe('audioCapture')
    expect(mapSpeechRecognitionError('network')).toBe('network')
    expect(mapSpeechRecognitionError('aborted')).toBe('aborted')
    expect(mapSpeechRecognitionError('other')).toBe('generic')
  })
})
