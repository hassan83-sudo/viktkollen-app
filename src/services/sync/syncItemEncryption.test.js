import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptSyncItemPayload,
  encryptedSyncItemFormat,
  encryptSyncItemPayload,
  isEncryptedSyncItemPayload,
} from './syncItemEncryption.js'

const rpc = vi.fn()
const client = { rpc }

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({
    data: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))),
    error: null,
  })
})

describe('client-side sync item encryption', () => {
  it('encrypts and authenticates an allowlisted value', async () => {
    const original = { name: 'Anna', weight: 78.2 }
    const encrypted = await encryptSyncItemPayload(original, 'viktkollen.profile', null, client)

    expect(encrypted.format).toBe(encryptedSyncItemFormat)
    expect(JSON.stringify(encrypted)).not.toContain('Anna')
    await expect(decryptSyncItemPayload(encrypted, 'viktkollen.profile', null, client)).resolves.toEqual(original)
    expect(isEncryptedSyncItemPayload(encrypted)).toBe(true)
  })

  it('binds ciphertext to its storage key', async () => {
    const encrypted = await encryptSyncItemPayload({ safe: true }, 'viktkollen.profile', null, client)

    await expect(decryptSyncItemPayload(encrypted, 'viktkollen.meals', null, client))
      .rejects.toThrow('integritetskontroll')
  })

  it('keeps tombstones empty and never asks for a key', async () => {
    await expect(encryptSyncItemPayload(null, 'viktkollen.profile', null, client)).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })
})
