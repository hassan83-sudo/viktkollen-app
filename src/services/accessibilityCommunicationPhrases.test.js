/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addCommunicationPhrase,
  communicationPhrasesKey,
  maxCommunicationPhraseLength,
  maxCommunicationPhrases,
  readCommunicationPhrases,
  removeCommunicationPhrase,
  restoreCommunicationPhrase,
} from './accessibilityCommunicationPhrases.js'

describe('accessibilityCommunicationPhrases (A11Y-7E)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('documents conservative, exact limits', () => {
    expect(maxCommunicationPhrases).toBe(20)
    expect(maxCommunicationPhraseLength).toBe(120)
  })

  it('uses a dedicated storage key, separate from the accessibility preferences key', () => {
    expect(communicationPhrasesKey).toBe('viktkollen.accessibility.communicationPhrases.v1')
    expect(communicationPhrasesKey).not.toBe('viktkollen.accessibility.preferences.v1')
  })

  it('starts empty when nothing is stored', () => {
    expect(readCommunicationPhrases()).toEqual([])
  })

  it('adds a trimmed phrase and persists it', () => {
    const result = addCommunicationPhrase('  Jag vill ha kaffe  ')
    expect(result.error).toBeNull()
    expect(result.phrase.text).toBe('Jag vill ha kaffe')
    expect(readCommunicationPhrases()).toHaveLength(1)
    expect(readCommunicationPhrases()[0].text).toBe('Jag vill ha kaffe')
  })

  it('rejects an empty phrase', () => {
    const result = addCommunicationPhrase('')
    expect(result.error).toBe('empty')
    expect(readCommunicationPhrases()).toHaveLength(0)
  })

  it('rejects a whitespace-only phrase', () => {
    const result = addCommunicationPhrase('    ')
    expect(result.error).toBe('empty')
    expect(readCommunicationPhrases()).toHaveLength(0)
  })

  it('rejects a phrase over the maximum length', () => {
    const result = addCommunicationPhrase('x'.repeat(maxCommunicationPhraseLength + 1))
    expect(result.error).toBe('tooLong')
    expect(readCommunicationPhrases()).toHaveLength(0)
  })

  it('accepts a phrase at exactly the maximum length', () => {
    const result = addCommunicationPhrase('x'.repeat(maxCommunicationPhraseLength))
    expect(result.error).toBeNull()
  })

  it('blocks a duplicate phrase predictably (case-insensitive, trimmed)', () => {
    addCommunicationPhrase('Ring min dotter')
    const result = addCommunicationPhrase('  ring min dotter  ')
    expect(result.error).toBe('duplicate')
    expect(readCommunicationPhrases()).toHaveLength(1)
  })

  it('enforces the maximum saved phrase count', () => {
    for (let i = 0; i < maxCommunicationPhrases; i += 1) addCommunicationPhrase(`Fras ${i}`)
    expect(readCommunicationPhrases()).toHaveLength(maxCommunicationPhrases)

    const result = addCommunicationPhrase('En fras för mycket')
    expect(result.error).toBe('limitReached')
    expect(readCommunicationPhrases()).toHaveLength(maxCommunicationPhrases)
  })

  it('removes a phrase by id', () => {
    const { phrase } = addCommunicationPhrase('Jag behöver vila')
    addCommunicationPhrase('Ring min kontakt')

    const next = removeCommunicationPhrase(phrase.id)
    expect(next).toHaveLength(1)
    expect(next[0].text).toBe('Ring min kontakt')
    expect(readCommunicationPhrases()).toHaveLength(1)
  })

  it('restores a removed phrase (undo) with its original id', () => {
    const { phrase } = addCommunicationPhrase('Jag vill gå ut')
    removeCommunicationPhrase(phrase.id)
    expect(readCommunicationPhrases()).toHaveLength(0)

    const restored = restoreCommunicationPhrase(phrase)
    expect(restored).toHaveLength(1)
    expect(restored[0]).toEqual(phrase)
  })

  it('restore is a no-op past the max limit', () => {
    for (let i = 0; i < maxCommunicationPhrases; i += 1) addCommunicationPhrase(`Fras ${i}`)
    const fake = { createdAt: new Date().toISOString(), id: 'phrase-fake', text: 'Extra' }
    const result = restoreCommunicationPhrase(fake)
    expect(result).toHaveLength(maxCommunicationPhrases)
  })

  it('stays safe and returns an empty list on malformed JSON', () => {
    window.localStorage.setItem(communicationPhrasesKey, '{not valid json')
    expect(() => readCommunicationPhrases()).not.toThrow()
    expect(readCommunicationPhrases()).toEqual([])
  })

  it('stays safe when the stored value is the wrong type', () => {
    window.localStorage.setItem(communicationPhrasesKey, JSON.stringify({ not: 'an array' }))
    expect(readCommunicationPhrases()).toEqual([])
  })

  it('filters out malformed items (missing/invalid fields, over-length text) without crashing', () => {
    window.localStorage.setItem(communicationPhrasesKey, JSON.stringify([
      { id: 'ok-1', text: 'Giltig fras' },
      { id: '', text: 'Missing id' },
      { id: 'no-text' },
      { id: 'blank-text', text: '   ' },
      { id: 'too-long', text: 'x'.repeat(maxCommunicationPhraseLength + 1) },
      'not-an-object',
      null,
      42,
    ]))

    expect(() => readCommunicationPhrases()).not.toThrow()
    const phrases = readCommunicationPhrases()
    expect(phrases).toHaveLength(1)
    expect(phrases[0].text).toBe('Giltig fras')
  })

  it('caps entries beyond the limit when reading pre-existing over-limit storage', () => {
    const overLimit = Array.from({ length: maxCommunicationPhrases + 5 }, (_, index) => ({
      createdAt: new Date().toISOString(),
      id: `phrase-${index}`,
      text: `Fras ${index}`,
    }))
    window.localStorage.setItem(communicationPhrasesKey, JSON.stringify(overLimit))

    expect(readCommunicationPhrases()).toHaveLength(maxCommunicationPhrases)
  })

  it('never stores diagnosis, medical category, identity, location, audio, or speech data fields', () => {
    const { phrase } = addCommunicationPhrase('Jag har ont')
    expect(Object.keys(phrase).sort()).toEqual(['createdAt', 'id', 'text'])
  })
})
