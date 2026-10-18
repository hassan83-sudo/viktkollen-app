const PAGE_ID = /^[A-Za-z0-9_-]{1,128}$/

// Only the hosted SumUp page may be opened. Card data and 3DS stay on that page.
export function officialSumUpHostedCheckoutUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return ''
  let url
  try {
    url = new URL(value)
  } catch {
    return ''
  }
  const scheme = value.indexOf('://')
  const authority = scheme < 0 ? '' : value.slice(scheme + 3).split(/[/?#]/, 1)[0]
  const host = authority.slice(authority.lastIndexOf('@') + 1)
  const segments = url.pathname.split('/')
  const pageId = segments[2] || ''
  if (host.includes(':') || url.protocol !== 'https:' || url.username || url.password || url.port) return ''
  if (url.hostname !== 'checkout.sumup.com') return ''
  if (segments.length !== 3 || segments[0] !== '' || segments[1] !== 'pay' || !PAGE_ID.test(pageId)) return ''
  if (url.pathname !== `/pay/${pageId}` || url.search || url.hash) return ''
  return value
}
