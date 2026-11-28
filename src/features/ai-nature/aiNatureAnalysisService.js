/**
 * AI Natur network adapter. No automatic uploads or background analysis.
 * The caller must obtain an image-bound consent token only after a visible
 * user approval, and the server must independently enforce billing/feature gates.
 */
export async function requestNatureIdentification({
  image,
  accessToken,
  consentToken,
  requestId,
  signal,
  onProgress,
} = {}) {
  if (!(image instanceof Blob) || image.size === 0 || image.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
    throw new Error('Välj en JPG-, PNG- eller WebP-bild på högst 8 MB.')
  }
  if (!accessToken || !consentToken) {
    throw new Error('Inloggning och uttryckligt bildsamtycke krävs.')
  }

  const bytes = new Uint8Array(await image.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  const imageBase64 = btoa(binary)
  const response = await fetch('/api/ai-nature-identification', {
    method: 'POST',
    headers: {
      ...(typeof onProgress === 'function' ? { Accept: 'text/event-stream' } : {}),
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-viktkollen-consent-token': consentToken,
      ...(requestId ? { 'x-viktkollen-request-id': requestId } : {}),
    },
    body: JSON.stringify({ mimeType: image.type, imageBase64 }),
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult = null
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''
        for (const frame of frames) {
          if (!frame.startsWith('data: ')) continue
          const event = JSON.parse(frame.slice(6))
          if (event.type === 'progress') onProgress?.(event.name)
          if (event.type === 'result' && event.ok === true) finalResult = event.result
          if (event.type === 'error') throw new Error('AI Natur är inte tillgänglig just nu.')
        }
      }
    } finally { reader.releaseLock() }
    if (!finalResult) throw new Error('Analysen kunde inte slutföras.')
    return finalResult
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true || !result?.result) {
    throw new Error(result?.message || 'AI Natur är inte tillgänglig just nu.')
  }
  return result.result
}
