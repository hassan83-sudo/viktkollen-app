import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decryptSocialMessage,
  encryptedSocialMessageFormat,
  encryptSocialMessage,
  isEncryptedSocialMessage,
} from './socialMessageEncryption.js'

const rpc = vi.fn()
const client = { rpc }

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({
    data: btoa(String.fromCharCode(...new Uint8Array(32).fill(13))),
    error: null,
  })
})

describe('encrypted social messages', () => {
  it('encrypts message text and round-trips it', async () => {
    const body = await encryptSocialMessage('hemligt meddelande', {
      client,
      conversationId: 'conv-1',
      messageId: 'message-1',
    })
    expect(isEncryptedSocialMessage(body)).toBe(true)
    expect(JSON.parse(body).format).toBe(encryptedSocialMessageFormat)
    expect(body).not.toContain('hemligt')
    await expect(decryptSocialMessage(body, {
      client,
      conversationId: 'conv-1',
      messageId: 'message-1',
    })).resolves.toBe('hemligt meddelande')
  })

  it('binds a message to its conversation and id', async () => {
    const body = await encryptSocialMessage('hemligt', {
      client,
      conversationId: 'conv-1',
      messageId: 'message-1',
    })
    await expect(decryptSocialMessage(body, {
      client,
      conversationId: 'conv-2',
      messageId: 'message-1',
    })).rejects.toThrow('integritetskontroll')
  })
})
