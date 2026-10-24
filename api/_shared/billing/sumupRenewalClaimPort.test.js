import { describe, expect, it, vi } from 'vitest'
import { createSumUpRenewalClaimPort } from './sumupRenewalClaimPort.js'

const input = {
  checkoutReference: 'rn123',
  subscriptionId: 'sub-123',
  periodEnd: '2026-10-01T00:00:00.000Z',
}

function fakeClient(response) {
  const rpc = vi.fn().mockResolvedValue(response)
  return { client: { schema: vi.fn().mockReturnValue({ rpc }) }, rpc }
}

describe('durable SumUp claim adapter', () => {
  it('rejects missing server client', () => {
    expect(() => createSumUpRenewalClaimPort()).toThrow('SUMUP_DURABLE_RENEWAL_UNAVAILABLE')
  })

  it('passes the claim to billing RPC without payment calls', async () => {
    const { client, rpc } = fakeClient({ data: { claimed: true, checkout_reference: 'rn123', status: 'processing' }, error: null })
    const port = createSumUpRenewalClaimPort({ client })
    await expect(port.claim(input)).resolves.toEqual({ claimed: true, status: 'processing' })
    expect(client.schema).toHaveBeenCalledWith('billing')
    expect(rpc).toHaveBeenCalledWith('claim_sumup_renewal_attempt', {
      p_checkout_reference: 'rn123',
      p_subscription_id: 'sub-123',
      p_period_end: input.periodEnd,
    })
  })

  it('preserves denied claims', async () => {
    const { client } = fakeClient({ data: { claimed: false, checkout_reference: 'rn123', status: 'processing' }, error: null })
    await expect(createSumUpRenewalClaimPort({ client }).claim(input)).resolves.toEqual({ claimed: false, status: 'processing' })
  })

  it('fails closed on database errors and malformed replies', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'failure' } })
    await expect(createSumUpRenewalClaimPort({ client }).claim(input)).rejects.toThrow('SUMUP_RENEWAL_CLAIM_FAILED')
    const other = fakeClient({ data: { claimed: true, checkout_reference: 'wrong', status: 'processing' }, error: null })
    await expect(createSumUpRenewalClaimPort({ client: other.client }).claim(input)).rejects.toThrow('SUMUP_RENEWAL_CLAIM_INVALID_RESPONSE')
  })
})
