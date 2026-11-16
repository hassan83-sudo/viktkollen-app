// Mirrors api/_shared/analysisConsent.js canonical single-image manifest.
// Image bytes are hashed locally and are never sent to the consent endpoint.
function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
async function sha256(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}
export async function requestAiNatureConsent({ image, accessToken, signal } = {}) {
  if (!(image instanceof Blob) || !accessToken || !crypto?.subtle) {
    throw new Error('Inloggning och en giltig bild krävs.')
  }
  const bytes = await image.arrayBuffer()
  const imageDigest = await sha256(bytes)
  const manifest = `v1|image:${bytes.byteLength}:${imageDigest}`
  const imageHash = await sha256(new TextEncoder().encode(manifest))
  const response = await fetch('/api/analysis-consent', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageHash,
      purpose: 'ai-nature-identification',
      uiConsentApproved: true,
    }),
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok !== true || typeof result?.token !== 'string') {
    throw new Error('Samtycke kunde inte verifieras.')
  }
  return result.token
}
