import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  allowedPhotoMimeTypes,
  preprocessNutritionPhoto,
  nutritionPhotoPreprocessingInternals,
  revokeNutritionPhotoObjectUrl,
  validateNutritionPhotoFile,
} from './nutritionPhotoPreprocessing.js'

function file({ name = 'meal.jpg', size = 1000, type = 'image/jpeg' } = {}) {
  return { name, size, type }
}

describe('nutritionPhotoPreprocessing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts jpg png and webp', () => {
    expect(allowedPhotoMimeTypes).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    expect(validateNutritionPhotoFile(file()).ok).toBe(true)
    expect(validateNutritionPhotoFile(file({ name: 'meal.png', type: 'image/png' })).ok).toBe(true)
    expect(validateNutritionPhotoFile(file({ name: 'meal.webp', type: 'image/webp' })).ok).toBe(true)
  })

  it('rejects MIME spoofing and oversized files', () => {
    expect(validateNutritionPhotoFile(file({ name: 'meal.jpg', type: 'text/plain' })).ok).toBe(false)
    expect(validateNutritionPhotoFile(file({ name: 'meal.exe', type: 'image/jpeg' })).ok).toBe(false)
    expect(validateNutritionPhotoFile(file({ size: 99 * 1024 * 1024 })).ok).toBe(false)
  })

  it('scales dimensions without upscaling', () => {
    expect(nutritionPhotoPreprocessingInternals.scaleDimensions(3200, 1600, 1600)).toMatchObject({ height: 800, width: 1600 })
    expect(nutritionPhotoPreprocessingInternals.scaleDimensions(800, 600, 1600)).toMatchObject({ height: 600, width: 800 })
  })

  it('revokes object URLs safely', () => {
    const original = globalThis.URL
    const revokeObjectURL = vi.fn()
    globalThis.URL = { ...original, revokeObjectURL }

    revokeNutritionPhotoObjectUrl('blob:test')

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test')
    globalThis.URL = original
  })

  it('returns a clear failure when iPhone image decode fails after file selection', async () => {
    const revokeObjectURL = vi.fn()

    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:meal',
      revokeObjectURL,
    })
    vi.stubGlobal('Image', class {
      set src(value) {
        this._src = value
        queueMicrotask(() => this.onerror?.())
      }
    })

    const result = await preprocessNutritionPhoto(file())

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('Bilden kunde inte läsas')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:meal')
  })
})
