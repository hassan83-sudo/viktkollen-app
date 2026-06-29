const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png']

function validateImage(image, label) {
  if (!image) {
    return `${label} saknas. Ladda upp både bild framifrån och från sidan.`
  }

  if (!allowedImageTypes.includes(image.contentType)) {
    return `${label} måste vara en JPEG-, JPG- eller PNG-fil.`
  }

  if (image.size > MAX_IMAGE_SIZE_BYTES) {
    return `${label} är för stor. Maxstorlek är 10 MB.`
  }

  return ''
}

/**
 * Validates the body analysis request method and uploaded images.
 *
 * @param {import('http').IncomingMessage} request
 * @param {{frontImage: object | null, sideImage: object | null}} images
 * @returns {{status: number, error: string} | null}
 */
export function validateRequest(request, images) {
  if (request.method !== 'POST') {
    return {
      error: 'Only POST requests are allowed for body analysis.',
      status: 405,
    }
  }

  const frontImageError = validateImage(images.frontImage, 'Bild framifrån')

  if (frontImageError) {
    return {
      error: frontImageError,
      status: 400,
    }
  }

  const sideImageError = validateImage(images.sideImage, 'Bild från sidan')

  if (sideImageError) {
    return {
      error: sideImageError,
      status: 400,
    }
  }

  return null
}
