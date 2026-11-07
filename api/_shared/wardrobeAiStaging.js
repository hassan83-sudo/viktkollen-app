// Dedicated AI Preview. No inherited Production credentials may satisfy this gate.
export const WARDROBE_AI_BRANCH = 'feature/wardrobe-photo-ai-review-20261023'
export const WARDROBE_AI_REF = 'armtslzspuebmlysnooq'
export function isWardrobeAiTarget(env = {}) {
  return env.VERCEL_GIT_COMMIT_REF === WARDROBE_AI_BRANCH || Boolean(env.WARDROBE_AI_PREVIEW)
}
export function wardrobeAiConfig(env = {}) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== WARDROBE_AI_BRANCH || env.WARDROBE_AI_PREVIEW !== 'true') return null
  const url = `https://${WARDROBE_AI_REF}.supabase.co`
  if (env.WARDROBE_AI_SUPABASE_URL !== url) return null
  const claims = (key) => { try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null } }
  const anon = env.WARDROBE_AI_ANON_KEY || ''
  const service = env.WARDROBE_AI_SERVICE_ROLE_KEY || ''
  // Require project-bound legacy keys; opaque keys cannot establish project identity offline.
  if (claims(anon)?.role !== 'anon' || claims(anon)?.ref !== WARDROBE_AI_REF) return null
  if (claims(service)?.role !== 'service_role' || claims(service)?.ref !== WARDROBE_AI_REF) return null
  const openAiKey = env.WARDROBE_AI_OPENAI_API_KEY || ''
  const consentSecret = env.WARDROBE_AI_CONSENT_SECRET || ''
  const budgetSek = Number(env.WARDROBE_AI_BUDGET_SEK)
  const maxCallSek = Number(env.WARDROBE_AI_MAX_CALL_SEK)
  if (openAiKey.length < 16 || consentSecret.length < 32 || env.WARDROBE_AI_PRICE_VERIFIED !== 'true') return null
  if (!Number.isFinite(budgetSek) || budgetSek <= 0 || budgetSek > 1 || !Number.isFinite(maxCallSek) || maxCallSek <= 0 || maxCallSek > budgetSek) return null
  return { url, anon, service, openAiKey, consentSecret, budgetSek, maxCallSek }
}
