// Bildrutor för lokal analys hålls ENDAST i tillfälligt arbetsminne
// (en canvas som aldrig fästs i DOM:en). Den kodas aldrig om till fil, data-URL
// eller blob-URL.

export const localFrameMaxEdge = 960

// MediaPipe (0.10.35, WASM) kraschar med "Check failed: 1 == ChannelSize()"
// när bildbredden inte är delbar med 4. Arbetsbilden avrundas därför alltid
// nedåt till multiplar av 4 i båda led (verifierat mot riktiga bilder).
export function getScaledSize(width, height, maxEdge = localFrameMaxEdge) {
  const w = Math.max(1, Math.round(width || 0))
  const h = Math.max(1, Math.round(height || 0))
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const toMultipleOf4 = (value) => Math.max(4, Math.floor(value / 4) * 4)
  return { height: toMultipleOf4(h * scale), width: toMultipleOf4(w * scale) }
}

// Nollställer en canvas så att pixelbufferten kan frigöras.
export function wipeCanvas(canvas) {
  if (!canvas) return
  try {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  } catch {
    // ignore
  }
  canvas.width = 0
  canvas.height = 0
}

export function measureLuminance(source, createCanvas = () => document.createElement('canvas')) {
  const probe = createCanvas()
  try {
    probe.width = 32
    probe.height = 32
    const context = probe.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(source, 0, 0, 32, 32)
    const { data } = context.getImageData(0, 0, 32, 32)
    let sum = 0
    for (let index = 0; index < data.length; index += 4) {
      sum += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
    }
    return sum / (data.length / 4)
  } catch {
    return null
  } finally {
    wipeCanvas(probe)
  }
}

function drawToWorkCanvas(source, sourceWidth, sourceHeight, createCanvas) {
  if (!source || !sourceWidth || !sourceHeight) return null
  const { height, width } = getScaledSize(sourceWidth, sourceHeight)
  const canvas = createCanvas()
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    wipeCanvas(canvas)
    return null
  }
  context.drawImage(source, 0, 0, width, height)
  return {
    canvas,
    height,
    luminance: measureLuminance(canvas, createCanvas),
    release() {
      wipeCanvas(canvas)
    },
    width,
  }
}

/**
 * Fryser en bildruta från videon till en canvas i minnet.
 * Anroparen MÅSTE kalla release() när analysen är klar.
 */
export function captureFrame(video, createCanvas = () => document.createElement('canvas')) {
  return drawToWorkCanvas(video, video?.videoWidth, video?.videoHeight, createCanvas)
}

/**
 * Läser en bild från mobilens egen kamera-app (filinput) direkt till en
 * canvas i minnet via createImageBitmap. Ingen fil-URL skapas och
 * bitmappen stängs direkt. Anroparen MÅSTE kalla release().
 */
export async function frameFromImageFile(file, {
  createBitmap = globalThis.createImageBitmap,
  createCanvas = () => document.createElement('canvas'),
} = {}) {
  if (!file || typeof createBitmap !== 'function') return null
  if (file.type && !/^image\//i.test(file.type)) return null
  let bitmap = null
  try {
    try {
      // EXIF-orientering från kamera-appen ska följas.
      bitmap = await createBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      bitmap = await createBitmap(file)
    }
    return drawToWorkCanvas(bitmap, bitmap?.width, bitmap?.height, createCanvas)
  } catch {
    return null
  } finally {
    bitmap?.close?.()
  }
}
