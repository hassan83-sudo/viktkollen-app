import { describe, expect, it, vi } from 'vitest'
import {
  cameraSessionModes,
  createCameraSession,
  isCameraSessionMode,
} from './cameraSession.js'

describe('cameraSession', () => {
  it('reuses the shared session modes without inventing a second getUserMedia stack', () => {
    expect(cameraSessionModes).toContain('check')
    expect(cameraSessionModes).toContain('items')
    expect(cameraSessionModes).toContain('body')
    expect(cameraSessionModes).toContain('food')
    expect(cameraSessionModes).toContain('eyes')
    expect(isCameraSessionMode('outfit')).toBe(true)
  })

  it('starts, flips facing mode and stops using existing permission helpers', async () => {
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const session = createCameraSession({ facingMode: 'user' })
    const started = await session.start()
    expect(started.ok).toBe(true)
    expect(getUserMedia).toHaveBeenCalled()
    expect(session.getFacingMode()).toBe('user')

    await session.flip()
    expect(session.getFacingMode()).toBe('environment')
    session.stop()
    expect(track.stop).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('returns a permission message instead of throwing when getUserMedia is missing', async () => {
    vi.stubGlobal('navigator', {})
    const session = createCameraSession()
    const result = await session.start()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/kamera/i)
    vi.unstubAllGlobals()
  })
})
