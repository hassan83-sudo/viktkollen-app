function getRequestHeader(request, name) {
  const headers = request.headers ?? {}

  return headers[name] || headers[name.toLowerCase()] || ''
}

function getMultipartBoundary(contentType) {
  return contentType
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('boundary='))
    ?.replace('boundary=', '')
}

async function readRequestBody(request) {
  if (request.body) {
    return Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(String(request.body), 'latin1')
  }

  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

function parseMultipartImages(rawBodyBuffer, boundary) {
  const rawBody = rawBodyBuffer.toString('latin1')
  const images = {}

  rawBody.split(`--${boundary}`).forEach((part) => {
    if (!part.includes('Content-Disposition')) {
      return
    }

    const [rawHeaders, ...contentParts] = part.split('\r\n\r\n')
    const content = contentParts.join('\r\n\r\n').replace(/\r\n--$/, '')
    const fieldName = rawHeaders.match(/name="([^"]+)"/)?.[1]
    const fileName = rawHeaders.match(/filename="([^"]*)"/)?.[1]
    const contentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]

    if (!fieldName || !fileName) {
      return
    }

    images[fieldName] = {
      contentType: contentType?.toLowerCase() || '',
      name: fileName,
      size: Buffer.byteLength(content, 'latin1'),
    }
  })

  return images
}

/**
 * Parses uploaded body analysis images from a multipart request.
 *
 * @param {import('http').IncomingMessage & { body?: unknown }} request
 * @returns {Promise<{frontImage: object | null, sideImage: object | null}>}
 */
export async function parseImages(request) {
  const contentType = getRequestHeader(request, 'content-type')
  const boundary = getMultipartBoundary(contentType)

  if (!contentType.includes('multipart/form-data') || !boundary) {
    return {
      frontImage: null,
      sideImage: null,
    }
  }

  const rawBodyBuffer = await readRequestBody(request)
  const images = parseMultipartImages(rawBodyBuffer, boundary)

  return {
    frontImage: images.frontImage ?? null,
    sideImage: images.sideImage ?? null,
  }
}
