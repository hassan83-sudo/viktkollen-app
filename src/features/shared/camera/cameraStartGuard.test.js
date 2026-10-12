import { describe, expect, it, vi } from 'vitest'

import { hasUserActivation, installCameraStartGuard } from './cameraStartGuard.js'

function fakeNavigator({ activation } = {}) {
  const stream = { id: 'stream' }
  const getUserMedia = vi.fn(async () => stream)
  return {
    getUserMedia,
    navigatorRef: { mediaDevices: { getUserMedia }, ...(activation ? { userActivation: activation } : {}) },
    stream,
  }
}

describe('camera start guard', () => {
  it('blocks a camera request before the user has interacted with the page and logs where it came from', async () => {
    const { getUserMedia, navigatorRef } = fakeNavigator({ activation: { hasBeenActive: false, isActive: false } })
    const log = vi.fn()
    expect(installCameraStartGuard({ log, navigatorRef })).toBe(true)

    await expect(navigatorRef.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }))
      .rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[camera-guard]'), expect.any(String))
  })

  it('lets camera features start normally after a tap', async () => {
    const activation = { hasBeenActive: false, isActive: false }
    const { getUserMedia, navigatorRef, stream } = fakeNavigator({ activation })
    installCameraStartGuard({ log: () => {}, navigatorRef })

    activation.hasBeenActive = true
    await expect(navigatorRef.mediaDevices.getUserMedia({ video: true })).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith({ video: true })
  })

  it('never blocks microphone-only requests (AI Coach, AI Örat)', async () => {
    const { navigatorRef, stream } = fakeNavigator({ activation: { hasBeenActive: false, isActive: false } })
    installCameraStartGuard({ log: () => {}, navigatorRef })
    await expect(navigatorRef.mediaDevices.getUserMedia({ audio: true })).resolves.toBe(stream)
  })

  it('keeps today\'s behaviour on browsers without userActivation, and installs only once', async () => {
    const { getUserMedia, navigatorRef, stream } = fakeNavigator()
    expect(hasUserActivation(navigatorRef)).toBe(true)
    installCameraStartGuard({ log: () => {}, navigatorRef })
    const firstGuard = navigatorRef.mediaDevices.getUserMedia
    installCameraStartGuard({ log: () => {}, navigatorRef })
    expect(navigatorRef.mediaDevices.getUserMedia).toBe(firstGuard)
    await expect(navigatorRef.mediaDevices.getUserMedia({ video: true })).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the camera API is missing', () => {
    expect(installCameraStartGuard({ navigatorRef: {} })).toBe(false)
    expect(installCameraStartGuard({ navigatorRef: undefined })).toBe(false)
  })
})
