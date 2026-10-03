/**
 * AI-EAR-1: the four AI Örat modes (docs/ai-ear/AI_EAR_1_MODES.md).
 *
 * `access` is the recommended launch access from the verified execution path,
 * not a security gate:
 * - sound / bird: the existing server hop /api/ai-ear/interpret to the
 *   Viktkollen-owned Cloud Run service (Perch + YAMNet). No third-party
 *   per-analysis fee; billing lists `ai.ear.interpret` as free and unmetered
 *   at launch (LAUNCH_UNMETERED_FEATURES).
 * - speech (AI-EAR-2C/2C1): `execution: 'browser'`, the browser's own
 *   SpeechRecognition. No Viktkollen server, route, provider or quota; no
 *   direct Viktkollen provider cost, so free. This applies only to browser
 *   dictation: server or audio-file transcription is a separate decision.
 * - melody: the same record and file screen as the other audio modes.
 *   `execution: 'local'` keeps that screen visible and never sends the
 *   recording. Recognition stays disconnected.
 *
 * Integration point for the Premium gate (Cursor): a premium mode may get an
 * `execution` only after its server route enforces the entitlement itself. A
 * client-side check is not a gate; this file never unlocks a paid request.
 */
export const aiEarModes = Object.freeze([
  Object.freeze({ access: 'free', execution: 'interpret', icon: '🔊', id: 'sound' }),
  Object.freeze({ access: 'free', execution: 'interpret', icon: '🐦', id: 'bird' }),
  // AI-EAR-2C1: free by product decision (docs/ai-ear/AI_EAR_2C_DICTATION.md).
  Object.freeze({ access: 'free', execution: 'browser', icon: '🗣️', id: 'speech' }),
  Object.freeze({ access: 'premium', execution: 'local', icon: '🎶', id: 'melody' }),
])

export const defaultAiEarModeId = 'sound'

export function getAiEarMode(id) {
  return aiEarModes.find((mode) => mode.id === id) || aiEarModes[0]
}
