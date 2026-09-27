const CHECKOUT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SUMUP_PAYMENT_WIDGET_SCRIPT = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js'

export function sumUpSandboxRequested(search = '') {
  return new URLSearchParams(String(search || '')).get('sumupSandbox') === '1'
}

/**
 * Mount config for the official Payment Widget. checkoutId is the only
 * SumUp identifier. The API key is never part of this object.
 * Amount is not passed here: SumUp charges the checkout the server created.
 */
export function sumUpWidgetMountConfig({ checkoutId } = {}) {
  const id = String(checkoutId || '')
  if (!CHECKOUT_ID_RE.test(id)) return null
  return Object.freeze({
    checkoutId: id,
    id: 'sumup-card',
    locale: 'sv-SE',
  })
}
