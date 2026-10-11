// Preview-only testväg för lokal kroppsscanning (BODY-SCAN-LOCAL-3).
//
// Två spärrar, båda måste släppa igenom:
// 1. Byggtid: vite.config.js bygger bara sidan när VERCEL_ENV === 'preview'
//    eller vid lokalt bygge utanför Vercel (__VK_BODY_SCAN_PREVIEW__).
// 2. Körtid: endast localhost eller Vercels Preview-adresser för projektet.
//    Production-domänen och alla andra adresser stängs ute (fail closed).

const previewHostPatterns = [
  // Unik adress per deployment: viktkollen-<hash>-appsonthego-s-projects.vercel.app
  /^viktkollen-[a-z0-9]{9}-appsonthego-s-projects\.vercel\.app$/,
  // Branch-alias: viktkollen-git-<branch>-appsonthego-s-projects.vercel.app
  /^viktkollen-git-[a-z0-9-]+-appsonthego-s-projects\.vercel\.app$/,
]

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isPreviewTestHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (localHosts.has(host)) return true
  return previewHostPatterns.some((pattern) => pattern.test(host))
}

export function isPreviewTestAllowed({ buildFlag, hostname }) {
  return buildFlag === true && isPreviewTestHost(hostname)
}

// Eget test-scope: skiljt från alla riktiga användare och från gäst.
export const previewTestScope = Object.freeze({
  kind: 'preview-test',
  storageId: 'preview-test',
  userId: 'preview-test',
})
