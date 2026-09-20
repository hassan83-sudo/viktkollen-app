/**
 * AI-örat: turns whatever the browser recorded/decoded into one small mono
 * 16-bit PCM WAV, entirely on the device.
 *
 * Why: the backend decodes WAV/FLAC/OGG/MP3 but NOT the WebM/Opus or MP4/AAC
 * that MediaRecorder produces, and Vercel request bodies are limited to ~4.5 MB.
 * The backend analyses at most the first ~12 s, so longer audio is cut here.
 *
 * Pure helpers (downmix, resample, encode) are exported for tests. Nothing in
 * this module uploads, stores or logs audio.
 */

export const AI_EAR_TARGET_SAMPLE_RATE = 32000
export const AI_EAR_MAX_SECONDS = 12
export const AI_EAR_MIN_SECONDS = 0.5
export const AI_EAR_MAX_INPUT_BYTES = 25 * 1024 * 1024

export function downmixToMono(channels) {
  if (!channels?.length) return new Float32Array(0)
  if (channels.length === 1) return channels[0]
  const length = channels[0].length
  const mono = new Float32Array(length)
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) mono[index] += channel[index] / channels.length
  }
  return mono
}

export function resampleLinear(samples, fromRate, toRate) {
  if (!samples.length || fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.floor(samples.length / ratio))
  const out = new Float32Array(outLength)
  for (let index = 0; index < outLength; index += 1) {
    const position = index * ratio
    const before = Math.floor(position)
    const after = Math.min(before + 1, samples.length - 1)
    const fraction = position - before
    out[index] = samples[before] * (1 - fraction) + samples[after] * fraction
  }
  return out
}

export function encodeWav16(samples, sampleRate) {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, Number.isFinite(samples[index]) ? samples[index] : 0))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return buffer
}

/** Channels -> { wav: Blob, seconds, truncated } ready for upload, or throws an Error with a short code. */
export function channelsToWav({ channels, sampleRate }) {
  const mono = downmixToMono(channels)
  if (!mono.length || !sampleRate) throw new Error('audio_empty')
  const seconds = mono.length / sampleRate
  if (seconds < AI_EAR_MIN_SECONDS) throw new Error('audio_too_short')

  const maxSourceSamples = Math.floor(AI_EAR_MAX_SECONDS * sampleRate)
  const trimmed = mono.length > maxSourceSamples ? mono.subarray(0, maxSourceSamples) : mono
  const targetRate = Math.min(sampleRate, AI_EAR_TARGET_SAMPLE_RATE)
  const resampled = resampleLinear(trimmed, sampleRate, targetRate)

  return {
    seconds: Math.min(seconds, AI_EAR_MAX_SECONDS),
    truncated: mono.length > maxSourceSamples,
    wav: new Blob([encodeWav16(resampled, targetRate)], { type: 'audio/wav' }),
  }
}

const passthroughCodes = ['audio_empty', 'audio_too_short', 'audio_too_large', 'audio_unsupported']

/** Decodes a recorded/uploaded Blob with the browser's own decoder and converts it to WAV. */
export async function blobToAiEarWav(blob, { audioContextFactory } = {}) {
  if (!blob || !blob.size) throw new Error('audio_empty')
  if (blob.size > AI_EAR_MAX_INPUT_BYTES) throw new Error('audio_too_large')

  const Ctor = typeof window === 'undefined' ? null : (window.AudioContext || window.webkitAudioContext)
  const context = audioContextFactory ? audioContextFactory() : (Ctor ? new Ctor() : null)
  if (!context) throw new Error('audio_unsupported')

  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const channels = []
    for (let index = 0; index < decoded.numberOfChannels; index += 1) channels.push(decoded.getChannelData(index))
    return channelsToWav({ channels, sampleRate: decoded.sampleRate })
  } catch (error) {
    if (passthroughCodes.includes(error?.message)) throw error
    throw new Error('audio_undecodable', { cause: error })
  } finally {
    context.close?.()
  }
}
