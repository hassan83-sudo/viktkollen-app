const STORAGE_KEY = 'viktkollen.profile-photo'
const MAX_EDGE = 256

export function readProfilePhoto(storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try {
    return storage?.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function writeProfilePhoto(dataUrl, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  const value = String(dataUrl || '').startsWith('data:image/') ? String(dataUrl) : ''
  try {
    if (!value) storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, value)
  } catch {
    return ''
  }
  return value
}

export async function createProfilePhotoFromFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('invalid_image')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('image_load_failed'))
      element.src = objectUrl
    })
    const scale = Math.min(MAX_EDGE / Math.max(image.width, 1), MAX_EDGE / Math.max(image.height, 1), 1)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas_unavailable')
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.84)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
