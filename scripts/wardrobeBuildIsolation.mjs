import { assertNoPublicServerKeys, assertWardrobeStagingConfig, isWardrobePreview, WARDROBE_BRANCH } from '../api/_shared/wardrobeStagingGuard.js'

export function isWardrobeLocalTest(env) {
  if (env.command !== 'serve') return false
  if (env.mode === 'test' && env.VITEST === 'true') return true
  // Existing accessibility/support fixtures use only a never-contacted loopback backend.
  return env.WARDROBE_LOCAL_A11Y_FIXTURE === 'true' &&
    env.VITE_SUPABASE_URL === 'http://127.0.0.1:54321' && ['local-a11y-check', 'local-ai-help-check'].includes(env.VITE_SUPABASE_ANON_KEY)
}

export function wardrobeBuildIsolation(env, sourceBranch) {
  assertNoPublicServerKeys(env)
  if (!sourceBranch) throw new Error('wardrobe_source_identity_invalid')
  const offline = sourceBranch === WARDROBE_BRANCH || isWardrobePreview(env)
  if (!offline) return { offline: false, define: {} }
  // Git checkout identity and provider identity must agree. No inferred production fallback.
  if (sourceBranch !== WARDROBE_BRANCH) throw new Error('wardrobe_source_identity_invalid')
  assertWardrobeStagingConfig(env)
  return {
    offline: true,
    envPrefix: [],
    define: {
      'import.meta.env.VITE_WARDROBE_OFFLINE': JSON.stringify('true'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.WARDROBE_STAGING_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.WARDROBE_STAGING_ANON_KEY),
    },
  }
}

export function wardrobeOfflineBrowserPolicy() {
  return {
    name: 'wardrobe-offline-network-policy',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => ({ html: html.replace('src="/src/main.jsx"', 'src="/src/features/smart-camera/wardrobePreview.jsx"'), tags: [{ tag: 'meta', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
      }, injectTo: 'head-prepend' }] }),
    },
  }
}
