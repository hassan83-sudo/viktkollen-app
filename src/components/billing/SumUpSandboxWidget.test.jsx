/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SumUpSandboxWidget from './SumUpSandboxWidget.jsx'

vi.mock('../../services/supabaseClient.js', () => ({ supabase: null }))

const CHECKOUT_ID = '7164c99b-13cb-42a1-8ba1-3c2c46a29de7'

describe('SumUpSandboxWidget', () => {
  afterEach(() => cleanup())
  it('does not load the widget when sandbox setup is unavailable', async () => {
    const mountWidget = vi.fn()
    render(
      <SumUpSandboxWidget
        isAuthenticated
        mountWidget={mountWidget}
        prepare={async () => ({ ok: false, status: 503 })}
      />,
    )
    expect(await screen.findByText('Sandbox-kassan är inte tillgänglig.')).toBeTruthy()
    expect(mountWidget).not.toHaveBeenCalled()
    expect(document.querySelector('script[data-sumup-widget="1"]')).toBeNull()
  })

  it('mounts SumUp with the server checkout and does not grant access', async () => {
    const mountWidget = vi.fn(() => ({ unmount() {} }))
    render(
      <SumUpSandboxWidget
        isAuthenticated
        mountWidget={mountWidget}
        prepare={async () => ({
          ok: true,
          payload: {
            accessGranted: false,
            amount: 4,
            checkoutId: CHECKOUT_ID,
            currency: 'SEK',
            ok: true,
            purpose: 'SETUP_RECURRING_PAYMENT',
          },
          status: 200,
        })}
      />,
    )
    expect(await screen.findByText('Kortuppgifter skickas till SumUp. Den här sidan ger ingen betald åtkomst.')).toBeTruthy()
    await waitFor(() => expect(mountWidget).toHaveBeenCalled())
    expect(mountWidget).toHaveBeenCalledWith(expect.objectContaining({
      checkoutId: CHECKOUT_ID,
      id: 'sumup-card',
      locale: 'sv-SE',
    }))
    expect(mountWidget.mock.calls[0][0]).not.toHaveProperty('amount')
    expect(JSON.stringify(mountWidget.mock.calls[0][0])).not.toMatch(/apiKey|card_number/)
  })
})
