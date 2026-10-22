// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProfilePhotoFromFile } from './profilePhotoStorage.js'
import { createWardrobePhoto, wardrobePhotoCanvas } from './wardrobePhoto.js'
vi.mock('./profilePhotoStorage.js', () => ({ createProfilePhotoFromFile: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
describe('wardrobe photo boundaries', () => {
  it.each(['image/svg+xml', 'text/html', 'application/octet-stream'])('rejects %s before decoding', async (type) => {
    await expect(createWardrobePhoto(new File(['x'], 'file', { type }))).rejects.toThrow('invalid_photo')
    expect(createProfilePhotoFromFile).not.toHaveBeenCalled()
  })
  it('rejects oversized files and unsafe output, and reuses metadata-stripping raster processing', async () => {
    await expect(createWardrobePhoto({ type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 })).rejects.toThrow()
    createProfilePhotoFromFile.mockResolvedValue('https://example.com/image.jpg')
    await expect(createWardrobePhoto(new File(['x'], 'shirt.jpg', { type: 'image/jpeg' }))).rejects.toThrow()
    createProfilePhotoFromFile.mockResolvedValue('data:image/jpeg;base64,YWJj')
    await expect(createWardrobePhoto(new File(['x'], 'shirt.jpg', { type: 'image/jpeg' }))).resolves.toBe('data:image/jpeg;base64,YWJj')
    await expect(wardrobePhotoCanvas('https://example.com/image.jpg')).rejects.toThrow()
  })
})
