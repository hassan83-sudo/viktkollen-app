/**
 * Humma / sjung: decides when a recording can stop by itself.
 *
 * It is fed one loudness value (RMS, 0..1) per frame and answers 'stop' once
 * enough singing or humming has been heard AND it has been quiet for
 * `silenceMs` without a break. Short pauses between lines (breaths, a beat of
 * rest) are shorter than that and do not stop the recording.
 *
 * "Quiet" is relative to the room: the noise floor is a low percentile of
 * everything heard so far, so steady background noise (a fan, traffic) is
 * treated as silence and singing above it as voice. Nothing here keeps or
 * sends audio; it only sees loudness numbers.
 */

export const HUMMING_SILENCE_MS = 2000
export const HUMMING_MIN_VOICED_MS = 2500
// Below this RMS a frame is always silence, whatever the room.
export const HUMMING_ABSOLUTE_SILENCE_RMS = 0.01
// A frame is voice when it is this many times louder than the noise floor (about +8 dB).
export const HUMMING_VOICE_OVER_FLOOR = 2.5
// Quieter parts of a phrase still count as voice when they are within this
// share of the loudest singing so far, so one long unbroken song is never
// mistaken for silence because the noise floor drifted up to it.
export const HUMMING_VOICE_OF_PEAK = 0.35
const FLOOR_PERCENTILE = 0.1
const MIN_FRAMES_FOR_FLOOR = 5

function percentile(sortedValues, fraction) {
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction))
  return sortedValues[index]
}

export function createHummingAutoStop({
  minVoicedMs = HUMMING_MIN_VOICED_MS,
  silenceMs = HUMMING_SILENCE_MS,
} = {}) {
  const levels = []
  let lastAt = null
  let lastVoicedAt = null
  let peak = 0
  let voicedMs = 0

  function threshold() {
    if (levels.length < MIN_FRAMES_FOR_FLOOR) return HUMMING_ABSOLUTE_SILENCE_RMS * HUMMING_VOICE_OVER_FLOOR
    const floor = percentile([...levels].sort((a, b) => a - b), FLOOR_PERCENTILE)
    return Math.max(HUMMING_ABSOLUTE_SILENCE_RMS, floor * HUMMING_VOICE_OVER_FLOOR)
  }

  return {
    /** @returns {'continue' | 'stop'} */
    update(rms, atMs) {
      const level = Number.isFinite(rms) && rms > 0 ? rms : 0
      const frameMs = lastAt === null ? 0 : Math.max(0, atMs - lastAt)
      lastAt = atMs
      const floorThreshold = threshold()
      const voiced = level >= HUMMING_ABSOLUTE_SILENCE_RMS
        && (level >= floorThreshold || level >= peak * HUMMING_VOICE_OF_PEAK)
      levels.push(level)
      if (voiced) {
        peak = Math.max(peak, level)
        voicedMs += frameMs
        lastVoicedAt = atMs
        return 'continue'
      }
      if (voicedMs < minVoicedMs || lastVoicedAt === null) return 'continue'
      return atMs - lastVoicedAt >= silenceMs ? 'stop' : 'continue'
    },
    get voicedMs() {
      return voicedMs
    },
  }
}

/**
 * Loudness of the live microphone stream through Web Audio. Returns null when
 * the browser has no AudioContext; the recording then simply runs until the
 * user stops it or the max duration is reached.
 */
export function createStreamLevelMeter(stream, { AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  if (!AudioContextImpl || !stream) return null
  let context
  try {
    context = new AudioContextImpl()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    return {
      read() {
        analyser.getFloatTimeDomainData(buffer)
        let sum = 0
        for (let index = 0; index < buffer.length; index += 1) sum += buffer[index] * buffer[index]
        return Math.sqrt(sum / buffer.length)
      },
      close() {
        try { source.disconnect() } catch { /* already gone */ }
        context.close?.().catch?.(() => {})
      },
    }
  } catch {
    context?.close?.().catch?.(() => {})
    return null
  }
}
