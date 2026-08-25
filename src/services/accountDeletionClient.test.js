import { describe, expect, it, vi } from 'vitest'

import {
  clearLocalViktkollenData,
  getLocalDeletionKeys,
  requestAccountDeletion,
} from './accountDeletionClient.js'

vi.mock('./ai/aiAuthTransport.js', () => ({
  getCurrentAiAuthorization: vi.fn(async () => ({
    authorizationHeader: 'Bearer test-token',
    ok: true,
    userScope: 'user-a',
  })),
}))

vi.mock('./userDataRepository.js', () => ({
  getBackupStorageKeys: () => ['viktkollen.profile', 'viktkollen.weights'],
  getDeletionStorageKeys: () => ['viktkollen.profile', 'viktkollen.weights', 'viktkollen.profile-photo'],
  removeUserData: vi.fn((key) => key !== 'viktkollen.weights'),
  userDataKeys: {
    cloudBackupMeta: 'viktkollen.cloudBackup.meta',
    demoMode: 'viktkollen.demoMode',
    profilePhoto: 'viktkollen.profile-photo',
  },
}))

describe('accountDeletionClient', () => {
  it('posts deletion requests with Authorization and no local credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      readiness: { serviceRoleConfigured: true },
    })))
    const result = await requestAccountDeletion({ fetchImpl, mode: 'dry-run' })

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('/api/account-deletion', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }))
  })

  it('reports safe failure envelopes from the server', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'AUTH_UNAVAILABLE', safeMessage: 'Server saknas' },
      ok: false,
    }), { status: 503 }))
    const result = await requestAccountDeletion({ fetchImpl, mode: 'account' })

    expect(result.ok).toBe(false)
    expect(result.error.safeMessage).toBe('Server saknas')
    expect(JSON.stringify(result)).not.toMatch(/Bearer|test-token/)
  })

  it('clears known local Viktkollen data and reports partial failure', () => {
    const result = clearLocalViktkollenData()

    expect(getLocalDeletionKeys()).toContain('viktkollen.profile')
    expect(getLocalDeletionKeys()).toContain('viktkollen.profile-photo')
    expect(result.ok).toBe(false)
    expect(result.failedKeys).toEqual(['viktkollen.weights'])
  })
})
