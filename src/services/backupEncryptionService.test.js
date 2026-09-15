import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('./supabaseClient.js', () => ({
  supabase: { rpc },
}))

const {
  decryptBackupPayload,
  encryptBackupPayload,
  encryptedBackupFormat,
  getBackupEncryptionKey,
  isEncryptedBackupPayload,
} = await import('./backupEncryptionService.js')

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({
    data: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    error: null,
  })
})

describe('client-side backup encryption', () => {
  it('round-trips a backup without storing readable user data', async () => {
    const original = {
      schemaVersion: 2,
      userData: { weight: [{ kilograms: 78.2 }] },
    }

    const encrypted = await encryptBackupPayload(original)

    expect(encrypted.format).toBe(encryptedBackupFormat)
    expect(encrypted).not.toHaveProperty('userData')
    expect(JSON.stringify(encrypted)).not.toContain('78.2')
    await expect(decryptBackupPayload(encrypted)).resolves.toEqual(original)
    expect(rpc).toHaveBeenCalledWith('viktkollen_get_or_create_backup_key')
  })

  it('leaves a legacy payload unchanged until migration succeeds', async () => {
    const legacy = { schemaVersion: 2 }

    expect(isEncryptedBackupPayload(legacy)).toBe(false)
    await expect(decryptBackupPayload(legacy)).resolves.toBe(legacy)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('can reuse one fetched key for several decryptions', async () => {
    const encrypted = await encryptBackupPayload({ value: 'one request per list' })
    const key = await getBackupEncryptionKey()
    rpc.mockClear()

    await expect(decryptBackupPayload(encrypted, key)).resolves.toEqual({
      value: 'one request per list',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
