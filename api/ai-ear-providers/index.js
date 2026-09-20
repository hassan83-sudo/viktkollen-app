import { aiRouteErrorCodes, sendSafeAiError, setNoStoreHeaders } from '../_shared/aiRouteErrors.js'
import musicHandler from '../_shared/aiEarMusicRoute.js'
import hummingHandler from '../_shared/aiEarHummingRoute.js'
import lyricsHandler from '../_shared/aiEarLyricsRoute.js'
import statusHandler from '../_shared/aiEarProvidersStatusRoute.js'

/**
 * ONE Vercel function for all optional third-party AI-örat audio features.
 *
 * Why one function: the Hobby plan allows at most 12 serverless functions per
 * deployment and the app already uses 10. The public URLs are unchanged and
 * are mapped here by rewrites in vercel.json:
 *
 *   POST /api/ai-ear-music-recognition     -> ?feature=music     (AudD)
 *   POST /api/ai-ear-humming-recognition   -> ?feature=humming   (ACRCloud)
 *   POST /api/ai-ear-lyrics-transcription  -> ?feature=speech    (OpenAI speech-to-text)
 *   GET  /api/ai-ear-providers                                   (which features are configured)
 *
 * The four handlers stay completely separate modules (api/_shared/aiEar*Route.js):
 * own consent purpose, own rate limit, own provider - this file only dispatches.
 * `feature` is a routing hint only; it grants nothing (auth, consent and
 * validation happen inside each handler).
 */

export const config = { api: { bodyParser: false } }

const handlers = { humming: hummingHandler, music: musicHandler, speech: lyricsHandler }

export default async function handler(request, response) {
  if (request.method === 'GET') return statusHandler(request, response)

  const feature = new URL(request.url || '/', 'https://viktkollen.invalid').searchParams.get('feature') || ''
  const target = Object.hasOwn(handlers, feature) ? handlers[feature] : null
  if (!target) {
    setNoStoreHeaders(response)
    return sendSafeAiError(response, { code: aiRouteErrorCodes.INVALID_REQUEST, requestId: '', status: 404 })
  }
  return target(request, response)
}
