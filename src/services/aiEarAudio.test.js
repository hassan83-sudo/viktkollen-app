/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

import {
  AI_EAR_MAX_SECONDS,
  AI_EAR_TARGET_SAMPLE_RATE,
  blobToAiEarWav,
  channelsToWav,
  downmixToMono,
  encodeWav16,
  resampleLinear,
} from './aiEarAudio.js'

function sine(length, rate, freq = 440) {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i += 1) out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / rate)
  return out
}

async function bytesOf(blob) {
  return new DataView(await blob.arrayBuffer())
}

describe('AI-örat audio preparation', () => {
  it('writes a valid mono 16-bit PCM WAV header', async () => {
    const view = new DataView(encodeWav16(sine(1000, 32000), 32000))
    const ascii = (offset, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(offset + i)))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(32000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(2000)
    expect(view.byteLength).toBe(44 + 2000)
  })

  it('clamps and sanitises samples (NaN, out of range)', () => {
    const view = new DataView(encodeWav16(Float32Array.from([NaN, 5, -5, Infinity]), 8000))
    expect(view.getInt16(44, true)).toBe(0)
    expect(view.getInt16(46, true)).toBe(0x7fff)
    expect(view.getInt16(48, true)).toBe(-0x8000)
    expect(view.getInt16(50, true)).toBe(0)
  })

  it('downmixes stereo to mono by averaging', () => {
    const mono = downmixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])])
    expect(Array.from(mono)).toEqual([0.5, 0.5])
  })

  it('resamples to the requested length', () => {
    expect(resampleLinear(sine(48000, 48000), 48000, 32000).length).toBe(32000)
    expect(resampleLinear(sine(100, 8000), 8000, 8000).length).toBe(100)
  })

  it('converts to at most 12 s at 32 kHz and reports truncation', async () => {
    const rate = 44100
    const { seconds, truncated, wav } = channelsToWav({ channels: [sine(rate * 20, rate)], sampleRate: rate })
    const view = await bytesOf(wav)

    expect(truncated).toBe(true)
    expect(seconds).toBe(AI_EAR_MAX_SECONDS)
    expect(view.getUint32(24, true)).toBe(AI_EAR_TARGET_SAMPLE_RATE)
    expect(view.getUint32(40, true)).toBe(AI_EAR_MAX_SECONDS * AI_EAR_TARGET_SAMPLE_RATE * 2)
    expect(wav.size).toBeLessThan(1024 * 1024)
    expect(wav.type).toBe('audio/wav')
  })

  it('keeps low sample rates as they are (no upsampling)', async () => {
    const { wav } = channelsToWav({ channels: [sine(8000 * 2, 8000)], sampleRate: 8000 })
    expect((await bytesOf(wav)).getUint32(24, true)).toBe(8000)
  })

  it('rejects empty and too-short audio with short codes', () => {
    expect(() => channelsToWav({ channels: [new Float32Array(0)], sampleRate: 16000 })).toThrow('audio_empty')
    expect(() => channelsToWav({ channels: [sine(100, 16000)], sampleRate: 16000 })).toThrow('audio_too_short')
  })

  it('decodes a blob through the browser decoder and closes the audio context', async () => {
    const close = vi.fn()
    const decoded = { getChannelData: () => sine(16000 * 2, 16000), numberOfChannels: 1, sampleRate: 16000 }
    const result = await blobToAiEarWav(new Blob([new Uint8Array(10)]), { audioContextFactory: () => ({ close, decodeAudioData: async () => decoded }) })

    expect(result.wav.size).toBeGreaterThan(44)
    expect(close).toHaveBeenCalled()
  })

  it('maps decoder failures to audio_undecodable and empty blobs to audio_empty', async () => {
    const failing = () => ({ close: () => {}, decodeAudioData: async () => { throw new Error('EncodingError') } })
    await expect(blobToAiEarWav(new Blob([new Uint8Array(10)]), { audioContextFactory: failing })).rejects.toThrow('audio_undecodable')
    await expect(blobToAiEarWav(new Blob([]))).rejects.toThrow('audio_empty')
  })
})
