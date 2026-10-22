import { createProfilePhotoFromFile } from './profilePhotoStorage.js'
import { isWardrobePhoto } from './wardrobeStorage.js'

// Existing raster pipeline re-encodes the image to JPEG and discards EXIF/GPS.
export async function createWardrobePhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('invalid_photo')
  const image = await createProfilePhotoFromFile(file)
  if (!isWardrobePhoto(image)) throw new Error('invalid_photo')
  return image
}

export async function wardrobePhotoCanvas(image) {
  if (!isWardrobePhoto(image)) throw new Error('invalid_photo')
  const element = new Image()
  await new Promise((resolve, reject) => { element.onload = resolve; element.onerror = reject; element.src = image })
  const canvas = document.createElement('canvas')
  canvas.width = element.naturalWidth
  canvas.height = element.naturalHeight
  canvas.getContext('2d').drawImage(element, 0, 0)
  return canvas
}
