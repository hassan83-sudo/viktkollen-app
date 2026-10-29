// Köp-id som SumUp skickar tillbaka kunden med (?vk_checkout=<id>).
const CHECKOUT_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/

export function openHostedCheckout(url) {
  window.location.assign(url)
}

export function readReturnedCheckoutId(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const value = new URLSearchParams(search).get('vk_checkout') || ''
    return CHECKOUT_ID_RE.test(value) ? value : ''
  } catch {
    return ''
  }
}
