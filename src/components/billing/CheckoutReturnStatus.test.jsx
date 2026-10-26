/* @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CheckoutReturnStatus from './CheckoutReturnStatus.jsx'
import { readReturnedCheckoutId } from '../../services/billing/checkoutReturn.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Betalningsstatus efter SumUp', () => {
  it('väntar på bekräftelse och visar sedan lyckad betalning med slutdatum', async () => {
    vi.useFakeTimers()
    const results = [{ state: 'pending' }, { state: 'paid', currentPeriodEnd: '2026-11-25T10:00:00.000Z' }]
    const onPaid = vi.fn()
    render(<CheckoutReturnStatus checkoutId="chk_1" fetchImpl={async () => results.shift()} onPaid={onPaid} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status').textContent).toContain('Väntar på bekräftelse')
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByRole('status').textContent).toContain('Betalningen är bekräftad. Planen gäller till 25 november 2026.')
    expect(onPaid).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['failed', 'Betalningen misslyckades'],
    ['cancelled', 'Köpet slutfördes inte'],
    ['review', 'kontrolleras manuellt'],
    ['unknown', 'kunde inte hämtas'],
  ])('visar %s tydligt och ger ingen bekräftelse', async (state, text) => {
    const onPaid = vi.fn()
    render(<CheckoutReturnStatus checkoutId="chk_1" fetchImpl={async () => ({ state })} onPaid={onPaid} />)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(screen.getByRole('status').textContent).toContain(text)
    expect(screen.getByRole('status').textContent).not.toContain('bekräftad')
    expect(onPaid).not.toHaveBeenCalled()
  })

  it('läser bara ett giltigt köp-id från adressen', () => {
    expect(readReturnedCheckoutId('?vk_checkout=chk_abc123')).toBe('chk_abc123')
    expect(readReturnedCheckoutId('?vk_checkout=<script>')).toBe('')
    expect(readReturnedCheckoutId('')).toBe('')
  })
})
