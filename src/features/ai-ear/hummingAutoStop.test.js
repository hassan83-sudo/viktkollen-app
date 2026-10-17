import { describe, expect, it } from 'vitest'

import { createHummingAutoStop, createStreamLevelMeter, HUMMING_MIN_VOICED_MS, HUMMING_SILENCE_MS } from './hummingAutoStop.js'

// Humma / sjung: when a recording may stop by itself. One frame = 100 ms.
const FRAME_MS = 100
const SILENCE = 0.002
const SONG = 0.2

/** Feeds [{ ms, rms | rms(index) }] segments; returns the ms at which it said 'stop', or null. */
function run(segments) {
  const detector = createHummingAutoStop()
  let at = 0
  for (const segment of segments) {
    for (let index = 0; index < segment.ms / FRAME_MS; index += 1) {
      at += FRAME_MS
      const level = typeof segment.rms === 'function' ? segment.rms(index) : segment.rms
      if (detector.update(level, at) === 'stop') return at
    }
  }
  return null
}

describe('Humma / sjung automatic stop', () => {
  it('uses about 2 s of silence and needs some singing first', () => {
    expect(HUMMING_SILENCE_MS).toBe(2000)
    expect(HUMMING_MIN_VOICED_MS).toBeGreaterThanOrEqual(2000)
  })

  it('a short sung phrase followed by silence does not stop by itself (the user stops, or 20 s does)', () => {
    expect(run([{ ms: 1000, rms: SONG }, { ms: 10000, rms: SILENCE }])).toBeNull()
  })

  it('stops about 2 s after a sung phrase ends', () => {
    const stoppedAt = run([{ ms: 5000, rms: SONG }, { ms: 5000, rms: SILENCE }])
    expect(stoppedAt).toBeGreaterThanOrEqual(5000 + 2000)
    expect(stoppedAt).toBeLessThanOrEqual(5000 + 2100)
  })

  it('quiet humming counts as melody', () => {
    const stoppedAt = run([{ ms: 600, rms: SILENCE }, { ms: 6000, rms: 0.05 }, { ms: 4000, rms: SILENCE }])
    expect(stoppedAt).toBeGreaterThanOrEqual(6600 + 2000)
    expect(stoppedAt).toBeLessThanOrEqual(6600 + 2100)
  })

  it('natural pauses between lines do not stop the recording', () => {
    const stoppedAt = run([
      { ms: 3000, rms: SONG }, { ms: 1500, rms: SILENCE },
      { ms: 3000, rms: SONG }, { ms: 1200, rms: SILENCE },
      { ms: 2000, rms: SONG }, { ms: 5000, rms: SILENCE },
    ])
    expect(stoppedAt).toBeGreaterThanOrEqual(10700 + 2000)
    expect(stoppedAt).toBeLessThanOrEqual(10700 + 2100)
  })

  it('waits while the user has not started singing yet', () => {
    const stoppedAt = run([{ ms: 4000, rms: SILENCE }, { ms: 4000, rms: SONG }, { ms: 5000, rms: SILENCE }])
    expect(stoppedAt).toBeGreaterThanOrEqual(8000 + 2000)
    expect(stoppedAt).toBeLessThanOrEqual(8000 + 2100)
  })

  it('with steady background noise, singing above it is voice and the noise alone is silence', () => {
    const noise = (index) => 0.04 + (index % 3) * 0.004
    const stoppedAt = run([{ ms: 1500, rms: noise }, { ms: 5000, rms: SONG }, { ms: 5000, rms: noise }])
    expect(stoppedAt).toBeGreaterThanOrEqual(6500 + 2000)
    expect(stoppedAt).toBeLessThanOrEqual(6500 + 2100)
  })

  it('background noise alone never stops it (the 20 s cap does)', () => {
    expect(run([{ ms: 20000, rms: (index) => 0.05 + (index % 4) * 0.005 }])).toBeNull()
  })

  it('one long unbroken song with softer passages is never cut off', () => {
    expect(run([{ ms: 18000, rms: (index) => (Math.floor(index / 3) % 2 ? SONG : 0.08) }])).toBeNull()
  })

  it('treats broken or missing levels as silence', () => {
    const detector = createHummingAutoStop()
    expect(detector.update(Number.NaN, 100)).toBe('continue')
    expect(detector.update(-1, 200)).toBe('continue')
    expect(detector.voicedMs).toBe(0)
  })

  it('has no level meter without Web Audio', () => {
    expect(createStreamLevelMeter({}, { AudioContextImpl: null })).toBeNull()
    expect(createStreamLevelMeter(null, { AudioContextImpl: class {} })).toBeNull()
  })
})
