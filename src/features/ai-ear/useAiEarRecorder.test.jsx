/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_EAR_MAX_SECONDS } from '../../services/aiEarAudio.js'
import { useAiEarRecorder } from './useAiEarRecorder.js'

// AI-EAR-2B: the shared MediaRecorder microphone engine of AI Örat.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function fakeEnv({ mimeType = 'audio/webm' } = {}) {
  const tracks = []
  const recorders = []
  const makeStream = () => {
    const track = { stop: vi.fn() }
    tracks.push(track)
    return { getTracks: () => [track] }
  }
  class FakeRecorder {
    constructor(stream) {
      this.stream = stream
      this.state = 'inactive'
      this.mimeType = mimeType
      this.stop = vi.fn(() => {
        if (this.state === 'inactive') throw new Error('InvalidStateError')
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob([new Uint8Array(50)]) })
        this.onstop?.()
      })
      recorders.push(this)
    }
    start() { this.state = 'recording' }
  }
  return { getUserMedia: vi.fn(async () => makeStream()), MediaRecorderImpl: FakeRecorder, recorders, tracks }
}

function setup(env, extra = {}) {
  const callbacks = { onError: vi.fn(), onRecorded: vi.fn(), onStart: vi.fn() }
  const hook = renderHook((props) => useAiEarRecorder(props), {
    initialProps: { getUserMedia: env.getUserMedia, MediaRecorderImpl: env.MediaRecorderImpl, ...callbacks, ...extra },
  })
  return { ...hook, ...callbacks }
}

describe('useAiEarRecorder (AI-EAR-2B)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  })
  afterEach(() => vi.useRealTimers())

  it('start → recording; stop → one Blob with the recorder type, tracks stopped', async () => {
    const env = fakeEnv({ mimeType: 'audio/mp4' })
    const { result, onRecorded, onStart } = setup(env)
    await act(() => result.current.start())
    expect(env.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.recording).toBe(true)
    expect(onStart).toHaveBeenCalledTimes(1)
    act(() => result.current.stop())
    expect(result.current.recording).toBe(false)
    expect(onRecorded).toHaveBeenCalledTimes(1)
    const blob = onRecorded.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('audio/mp4')
    expect(blob.size).toBe(50)
    expect(env.tracks[0].stop).toHaveBeenCalled()
  })

  it('counts seconds and stops by itself at the max duration (default 12 s, same as before)', async () => {
    vi.useFakeTimers()
    const env = fakeEnv()
    const { result, onRecorded } = setup(env)
    expect(AI_EAR_MAX_SECONDS).toBe(12)
    await act(() => result.current.start())
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.seconds).toBe(3)
    act(() => { vi.advanceTimersByTime(9500) })
    expect(onRecorded).toHaveBeenCalledTimes(1)
    expect(result.current.recording).toBe(false)
    expect(env.tracks[0].stop).toHaveBeenCalled()
  })

  it('a custom max duration is honoured (for future modes)', async () => {
    vi.useFakeTimers()
    const env = fakeEnv()
    const { result, onRecorded } = setup(env, { maxSeconds: 2 })
    await act(() => result.current.start())
    act(() => { vi.advanceTimersByTime(2250) })
    expect(onRecorded).toHaveBeenCalledTimes(1)
  })

  it('denied permission → mic_denied (NotAllowedError and SecurityError), nothing recording', async () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const env = fakeEnv()
      env.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name }))
      const { result, onError } = setup(env)
      await act(() => result.current.start())
      expect(onError).toHaveBeenCalledWith('mic_denied')
      expect(result.current.recording).toBe(false)
      expect(env.recorders).toHaveLength(0)
    }
  })

  it('unavailable microphone → mic_unavailable (no MediaRecorder, no mediaDevices, device error)', async () => {
    let env = fakeEnv()
    let hook = setup({ ...env, MediaRecorderImpl: null })
    await act(() => hook.result.current.start())
    expect(hook.onError).toHaveBeenCalledWith('mic_unavailable')
    expect(env.getUserMedia).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    env = fakeEnv()
    hook = setup(env)
    await act(() => hook.result.current.start())
    expect(hook.onError).toHaveBeenCalledWith('mic_unavailable')
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })

    env = fakeEnv()
    env.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NotFoundError' }))
    hook = setup(env)
    await act(() => hook.result.current.start())
    expect(hook.onError).toHaveBeenCalledWith('mic_unavailable')
  })

  it('unmount while recording stops the tracks, the recorder and the timer, and delivers nothing', async () => {
    vi.useFakeTimers()
    const env = fakeEnv()
    const { result, unmount, onRecorded } = setup(env)
    await act(() => result.current.start())
    unmount()
    expect(env.recorders[0].stop).toHaveBeenCalled()
    expect(env.tracks[0].stop).toHaveBeenCalled()
    expect(onRecorded).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unmount while the permission prompt is open releases the microphone when it arrives', async () => {
    const env = fakeEnv()
    let grant
    env.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { grant = resolve }))
    const { result, unmount, onStart } = setup(env)
    let pending
    act(() => { pending = result.current.start() })
    unmount()
    const track = { stop: vi.fn() }
    grant({ getTracks: () => [track] })
    await pending
    expect(track.stop).toHaveBeenCalled()
    expect(env.recorders).toHaveLength(0)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('cancel (abort) stops everything without a Blob', async () => {
    const env = fakeEnv()
    const { result, onRecorded } = setup(env)
    await act(() => result.current.start())
    act(() => result.current.cancel())
    expect(result.current.recording).toBe(false)
    expect(env.tracks[0].stop).toHaveBeenCalled()
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('a second recording after the first works and uses a new stream', async () => {
    const env = fakeEnv()
    const { result, onRecorded } = setup(env)
    await act(() => result.current.start())
    act(() => result.current.stop())
    await act(() => result.current.start())
    expect(result.current.recording).toBe(true)
    act(() => result.current.stop())
    expect(onRecorded).toHaveBeenCalledTimes(2)
    expect(env.getUserMedia).toHaveBeenCalledTimes(2)
    expect(env.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true)
  })

  it('double start (also while the permission prompt is open) opens the microphone once', async () => {
    const env = fakeEnv()
    const { result } = setup(env)
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()])
    })
    await act(() => result.current.start())
    expect(env.getUserMedia).toHaveBeenCalledTimes(1)
    expect(env.recorders).toHaveLength(1)
  })

  it('double stop and stop while idle do not throw or deliver twice', async () => {
    const env = fakeEnv()
    const { result, onRecorded } = setup(env)
    expect(() => act(() => result.current.stop())).not.toThrow()
    await act(() => result.current.start())
    act(() => {
      result.current.stop()
      result.current.stop()
    })
    expect(onRecorded).toHaveBeenCalledTimes(1)
    expect(env.recorders[0].stop).toHaveBeenCalledTimes(1)
  })
})
