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
} = {}) {
  if (!(image instanceof Blob) || image.size === 0 || image.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
    throw new Error('Välj en JPG-, PNG- eller WebP-bild på högst 8 MB.')
  }
  if (!accessToken || !consentToken) {
    throw new Error('Inloggning och uttryckligt bildsamtycke krävs.')
  }

  const form = new FormData()
  form.append('image', image, 'naturbild')
  const response = await fetch('/api/ai-nature-identification', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-viktkollen-consent-token': consentToken,
      ...(requestId ? { 'x-viktkollen-request-id': requestId } : {}),
    },
    body: form,
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true || !result?.identification) {
    throw new Error(result?.message || 'AI Natur är inte tillgänglig just nu.')
  }
  return result.identification
}
