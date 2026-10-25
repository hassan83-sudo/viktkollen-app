import { describe, expect, it } from 'vitest'
import { checkPreviewAuthEnvironment } from './previewAuthPreflight.js'

const valid = {
  VERCEL_ENV: 'preview',
  VITE_SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co',
  SUPABASE_URL: 'https://armtslzspuebmlysnooq.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-public-anon-key',
}

describe('Preview auth environment preflight', () => {
  it('accepts matching staging configuration', () => {
    expect(checkPreviewAuthEnvironment(valid).ok).toBe(true)
  })
  it('rejects production client or server URLs', () => {
    expect(checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_URL: 'https://bxmdlckrlwzdtcxnsqqr.supabase.co' }).ok).toBe(false)
  })
  it('rejects mismatched project, missing anon key, and production target', () => {
    expect(checkPreviewAuthEnvironment({ ...valid, SUPABASE_URL: 'https://other.supabase.co' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: '' }).ok).toBe(false)
    expect(checkPreviewAuthEnvironment({ ...valid, VERCEL_ENV: 'production' }).ok).toBe(false)
  })
  it('never includes credentials in the output', () => {
    const secret = 'DO_NOT_PRINT_THIS_KEY'
    const result = checkPreviewAuthEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: secret })
    expect(JSON.stringify(result)).not.toContain(secret)
  })
})
