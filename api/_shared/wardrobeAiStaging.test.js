import { describe, expect, it, vi } from 'vitest'
import { wardrobeAiConfig, WARDROBE_AI_BRANCH, WARDROBE_AI_REF } from './wardrobeAiStaging.js'
import { blockWardrobeApi, isWardrobePreview } from './wardrobeStagingGuard.js'
import { wardrobeBuildIsolation } from '../../scripts/wardrobeBuildIsolation.mjs'
import { reserveWardrobeAiBudget } from './wardrobeAiBudget.js'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const jwt = (role, ref = WARDROBE_AI_REF) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.fixture-only-not-signed`
export function aiPreviewFixture() {
  return { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: WARDROBE_AI_BRANCH, WARDROBE_AI_PREVIEW: 'true', WARDROBE_AI_SUPABASE_URL: `https://${WARDROBE_AI_REF}.supabase.co`, WARDROBE_AI_ANON_KEY: jwt('anon'), WARDROBE_AI_SERVICE_ROLE_KEY: jwt('service_role'), WARDROBE_AI_OPENAI_API_KEY: 'test-only-openai-never-dispatched', WARDROBE_AI_CONSENT_SECRET: 'test-only-consent-secret-not-for-use-1234', WARDROBE_AI_BUDGET_SEK: '1', WARDROBE_AI_MAX_CALL_SEK: '0.05', WARDROBE_AI_PRICE_VERIFIED: 'true' }
}
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } }
describe('AI wardrobe staging boundary', () => {
  it('requires exact branch, preview environment, project-bound keys and verified bounded price', () => {
    const env = aiPreviewFixture()
    expect(wardrobeAiConfig(env)).not.toBeNull()
    for (const patch of [{ VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'main' }, { WARDROBE_AI_PREVIEW: '' }, { WARDROBE_AI_SUPABASE_URL: 'https://production.supabase.co' }, { WARDROBE_AI_SERVICE_ROLE_KEY: jwt('service_role', 'production') }, { WARDROBE_AI_ANON_KEY: jwt('anon', 'production') }, { WARDROBE_AI_OPENAI_API_KEY: '' }, { WARDROBE_AI_PRICE_VERIFIED: '' }, { WARDROBE_AI_BUDGET_SEK: '2' }, { WARDROBE_AI_MAX_CALL_SEK: 'NaN' }]) {
      expect(wardrobeAiConfig({ ...env, ...patch })).toBeNull()
    }
  })
  it('only opens consent and object analysis; every other API remains blocked', () => {
    const env = aiPreviewFixture()
    expect(blockWardrobeApi(response(), env, 'analysis-consent')).toBe(false)
    expect(blockWardrobeApi(response(), env, 'object-bank-scan')).toBe(false)
    for (const route of ['', 'billing', 'ai', 'body-analysis', 'nutrition-photo-analysis', 'account-deletion']) expect(blockWardrobeApi(response(), env, route)).toBe(true)
    expect(blockWardrobeApi(response(), { ...env, WARDROBE_AI_PRICE_VERIFIED: '' }, 'object-bank-scan')).toBe(true)
    expect(isWardrobePreview({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: WARDROBE_AI_BRANCH })).toBe(true)
  })
  it('fails the build with missing config and only defines dedicated public keys', () => {
    const env = aiPreviewFixture()
    expect(() => wardrobeBuildIsolation({}, WARDROBE_AI_BRANCH)).toThrow('wardrobe_ai_staging_configuration_required')
    const build = wardrobeBuildIsolation({ ...env, VITE_SUPABASE_URL: 'https://production.supabase.co' }, WARDROBE_AI_BRANCH)
    expect(build.aiPreview).toBe(true)
    expect(build.envPrefix).toEqual([])
    expect(JSON.stringify(build.define)).not.toContain(env.WARDROBE_AI_SERVICE_ROLE_KEY)
    expect(JSON.stringify(build.define)).not.toContain(env.WARDROBE_AI_OPENAI_API_KEY)
    expect(JSON.stringify(build.define)).not.toContain('production.supabase.co')
  })
  it('denies budget reservation before touching a store when config is incomplete', async () => {
    const fetchImpl = vi.fn()
    expect((await reserveWardrobeAiBudget({ env: {}, fetchImpl, userId: 'test-user' })).ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('reserves in the real SQL counter, rejects excess calls and forbids public access', async () => {
    const db = new PGlite()
    try {
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
      await db.exec(readFileSync(new URL('../../supabase/migrations/20261023125222_wardrobe_ai_preview_budget.sql', import.meta.url), 'utf8'))
      const env = { ...aiPreviewFixture(), WARDROBE_AI_BUDGET_SEK: '0.10', WARDROBE_AI_MAX_CALL_SEK: '0.06' }
      const fetchImpl = vi.fn(async (_url, init) => {
        const p = JSON.parse(init.body)
        const { rows } = await db.query('select public.wardrobe_ai_reserve_preview_call($1,$2,$3) as result', [p.p_budget_sek, p.p_call_sek, p.p_user_hash])
        return { ok: true, json: async () => rows[0].result }
      })
      const results = await Promise.all(['a', 'b'].map((userId) => reserveWardrobeAiBudget({ env, userId, fetchImpl })))
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(results.filter((r) => r.reason === 'budget')).toHaveLength(1)
      expect(fetchImpl.mock.calls[0][0]).toBe(`https://${WARDROBE_AI_REF}.supabase.co/rest/v1/rpc/wardrobe_ai_reserve_preview_call`)
      await db.exec('set role anon')
      await expect(db.query("select public.wardrobe_ai_reserve_preview_call(1,0.01,'aaaaaaaaaaaaaaaaaaaaaaaa')")).rejects.toThrow(/permission denied/)
    } finally { await db.close() }
  })
})
