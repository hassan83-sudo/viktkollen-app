import { expect, it } from 'vitest'
import { wardrobeBuildIsolation, wardrobeSourceBranch } from '../../scripts/wardrobeBuildIsolation.mjs'

const branch = 'feature/wardrobe-photo-ai-review-20261023'
it('resolves a detached Preview checkout without relying on the optional VERCEL marker', () => {
  expect(wardrobeSourceBranch('', { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: branch })).toBe(branch)
})
it('does not override a conflicting Git branch or infer an unidentified environment', () => {
  expect(wardrobeSourceBranch('main', { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: branch })).toBe('main')
  expect(wardrobeSourceBranch('', { VERCEL_GIT_COMMIT_REF: branch })).toBe('')
  expect(() => wardrobeBuildIsolation({ WARDROBE_AI_PREVIEW: 'true' }, 'main')).toThrow('wardrobe_source_identity_invalid')
})
