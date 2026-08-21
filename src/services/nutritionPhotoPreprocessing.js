export const allowedPhotoMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
export const allowedPhotoExtensions = ['.jpg', '.jpeg', '.png', '.webp']
export const maxNutritionPhotoFileBytes = 8 * 1024 * 1024
export const maxNutritionPhotoDimension = 1920

function safeText(value, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim()
}

function getExtension(name = '') {
  const lower = String(name).toLocaleLowerCase('sv-SE')
  const index = lower.lastIndexOf('.')

  return index >= 0 ? lower.slice(index) : ''
}

export function validateNutritionPhotoFile(file) {
  const errors = []
  if (!file) errors.push('Välj en bildfil.')
  const type = safeText(file?.type).toLocaleLowerCase('sv-SE')
  const extension = getExtension(file?.name)

  if (file && !allowedPhotoMimeTypes.includes(type)) errors.push('Bildformatet stöds inte. Använd jpg, png eller webp.')
  if (file && !allowedPhotoExtensions.includes(extension)) errors.push('Filändelsen matchar inte ett tillåtet bildformat.')
  if (file?.size > maxNutritionPhotoFileBytes) errors.push('Bilden är för stor. Välj en mindre bild.')

  return {
    errors,
    ok: errors.length === 0,
  }
}

function createObjectUrl(blob) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return ''

  return URL.createObjectURL(blob)
}

export function revokeNutritionPhotoObjectUrl(url) {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Bildförhandsvisning stöds inte i denna miljö.'))
      return
    }
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Bilden kunde inte läsas.'))
    image.src = url
  })
}

function scaleDimensions(width, height, maxDimension = maxNutritionPhotoDimension) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { height: 0, scale: 1, width: 0 }
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height))

  return {
    height: Math.round(height * scale),
    scale,
    width: Math.round(width * scale),
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      reject(new Error('Bildkomprimering stöds inte.'))
      return
    }
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Bilden kunde inte komprimeras.'))
      else resolve(blob)
    }, type, quality)
  })
}

export async function preprocessNutritionPhoto(file, options = {}) {
  const validation = validateNutritionPhotoFile(file)
  if (!validation.ok) {
    return { errors: validation.errors, ok: false }
  }

  const previewUrl = createObjectUrl(file)
  if (!previewUrl) {
    return {
      errors: [],
      file,
      metadata: {
        dimensions: '',
        fileType: file.type,
        originalSizeBytes: file.size,
        sizeBytes: file.size,
      },
      ok: true,
      previewUrl: '',
      processedBlob: file,
      revoke: () => {},
    }
  }

  try {
    const image = await loadImage(previewUrl)
    const dimensions = scaleDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, options.maxDimension || maxNutritionPhotoDimension)
    if (!dimensions.width || !dimensions.height) throw new Error('Bilddimensionerna kunde inte läsas.')

    if (dimensions.scale >= 1 || typeof document === 'undefined') {
      return {
        errors: [],
        metadata: {
          dimensions: `${dimensions.width}x${dimensions.height}`,
          fileType: file.type,
          originalSizeBytes: file.size,
          sizeBytes: file.size,
        },
        ok: true,
        previewUrl,
        processedBlob: file,
        revoke: () => revokeNutritionPhotoObjectUrl(previewUrl),
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas kunde inte skapas.')
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
    const processedBlob = await canvasToBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88)

    return {
      errors: [],
      metadata: {
        dimensions: `${dimensions.width}x${dimensions.height}`,
        fileType: processedBlob.type || file.type,
        originalSizeBytes: file.size,
        sizeBytes: processedBlob.size,
      },
      ok: true,
      previewUrl,
      processedBlob,
      revoke: () => revokeNutritionPhotoObjectUrl(previewUrl),
    }
  } catch (error) {
    revokeNutritionPhotoObjectUrl(previewUrl)
    return {
      errors: [safeText(error.message, 'Bilden kunde inte förberedas.')],
      ok: false,
    }
  }
}

export const nutritionPhotoPreprocessingInternals = {
  getExtension,
  scaleDimensions,
}
