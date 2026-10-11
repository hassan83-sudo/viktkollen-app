// Laddar MediaPipe Pose Landmarker lokalt i webbläsaren.
//
// Alla filer (WASM-laddare, WASM-binär, modell) är Vite-assets från appens
// egen origin. Biblioteket anropas bara med bildrutor som redan finns i
// minnet på enheten; inget skickas till någon server.

import modelUrl from './assets/pose_landmarker_lite.task?url'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmNoSimdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url'
import wasmNoSimdBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url'

export const localModelAssetUrls = Object.freeze({
  model: modelUrl,
  wasmBinary: wasmBinaryUrl,
  wasmLoader: wasmLoaderUrl,
  wasmNoSimdBinary: wasmNoSimdBinaryUrl,
  wasmNoSimdLoader: wasmNoSimdLoaderUrl,
})

export const localModelErrorCodes = Object.freeze({
  loadFailed: 'load-failed',
  unsupported: 'unsupported',
})

export class LocalModelUnavailableError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LocalModelUnavailableError'
    this.code = code
  }
}

export function isLocalModelEnvironmentSupported(globalObject = globalThis) {
  return typeof globalObject.WebAssembly === 'object'
    && typeof globalObject.WebAssembly?.instantiate === 'function'
    && typeof globalObject.document?.createElement === 'function'
}

// Kontroll mot oavsiktliga externa URL:er: endast relativa eller
// same-origin-adresser accepteras för modell- och WASM-filer.
export function isSameOriginAssetUrl(url, origin = globalThis.location?.origin || '') {
  const value = String(url || '')
  if (!value) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (value.startsWith('./') || value.startsWith('../')) return true
  try {
    return Boolean(origin) && new URL(value).origin === origin
  } catch {
    return false
  }
}

function copyLandmarks(list) {
  return (Array.isArray(list) ? list : []).map((point) => ({
    visibility: Number.isFinite(point?.visibility) ? point.visibility : 0,
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    z: Number(point?.z) || 0,
  }))
}

/**
 * Skapar en lokal pose-analysator. Kastar LocalModelUnavailableError om
 * modellen inte kan laddas - det finns ingen server-fallback.
 */
export async function createLocalPoseAnalyzer({
  importVision = () => import('@mediapipe/tasks-vision'),
  urls = localModelAssetUrls,
} = {}) {
  if (!isLocalModelEnvironmentSupported()) {
    throw new LocalModelUnavailableError(localModelErrorCodes.unsupported, 'WebAssembly stöds inte i den här webbläsaren.')
  }

  const assetUrls = [urls.model, urls.wasmLoader, urls.wasmBinary, urls.wasmNoSimdLoader, urls.wasmNoSimdBinary]
  if (!assetUrls.every((url) => isSameOriginAssetUrl(url))) {
    throw new LocalModelUnavailableError(localModelErrorCodes.loadFailed, 'Modellfilerna måste komma från appen själv.')
  }

  let landmarker
  try {
    const { FilesetResolver, PoseLandmarker } = await importVision()
    const simd = await FilesetResolver.isSimdSupported().catch(() => false)
    const fileset = simd
      ? { wasmBinaryPath: urls.wasmBinary, wasmLoaderPath: urls.wasmLoader }
      : { wasmBinaryPath: urls.wasmNoSimdBinary, wasmLoaderPath: urls.wasmNoSimdLoader }

    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { delegate: 'CPU', modelAssetPath: urls.model },
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      numPoses: 1,
      outputSegmentationMasks: true,
      runningMode: 'IMAGE',
    })
  } catch (error) {
    throw new LocalModelUnavailableError(
      localModelErrorCodes.loadFailed,
      error instanceof Error ? error.message : 'Modellen kunde inte laddas.',
    )
  }

  let closed = false

  return {
    /**
     * Analyserar en bildruta (canvas) på enheten. Returnerar kopierade
     * landmärken och en kopierad silhuettmask. Biblioteksobjekt stängs direkt.
     */
    analyze(image) {
      if (closed) throw new Error('Analysatorn är stängd.')
      const result = landmarker.detect(image)
      const masks = Array.isArray(result?.segmentationMasks) ? result.segmentationMasks : []
      try {
        const mask = masks[0]
        return {
          landmarks: copyLandmarks(result?.landmarks?.[0]),
          mask: mask
            ? { data: new Float32Array(mask.getAsFloat32Array()), height: mask.height, width: mask.width }
            : null,
        }
      } finally {
        masks.forEach((mask) => mask?.close?.())
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        landmarker?.close?.()
      } catch {
        // Stängning får aldrig krascha UI:t.
      }
      landmarker = null
    },
  }
}
