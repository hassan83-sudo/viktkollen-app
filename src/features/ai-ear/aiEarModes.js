/**
 * AI-EAR-1: the four AI Örat modes (docs/ai-ear/AI_EAR_1_MODES.md).
 *
 * `access` is the recommended launch access from the verified execution path,
 * not a security gate:
 * - sound / bird: the existing server hop /api/ai-ear/interpret to the
 *   Viktkollen-owned Cloud Run service (Perch + YAMNet). No third-party
 *   per-analysis fee; billing lists `ai.ear.interpret` as free and unmetered
 *   at launch (LAUNCH_UNMETERED_FEATURES).
 * - speech / melody: the only implementations (OpenAI speech-to-text,
 *   ACRCloud humming) are on the unmerged branch
 *   sprint-12a-ai-ear-reintegration and charge per request. They are not
 *   connected here: `execution: null` shows the mode without any way to send
 *   audio.
 *
 * Integration point for the Premium gate (Cursor): a premium mode may get an
 * `execution` only after its server route enforces the entitlement itself. A
 * client-side check is not a gate; this file never unlocks a paid request.
 */
export const aiEarModes = Object.freeze([
  Object.freeze({ access: 'free', execution: 'interpret', icon: '🔊', id: 'sound' }),
  Object.freeze({ access: 'free', execution: 'interpret', icon: '🐦', id: 'bird' }),
  Object.freeze({ access: 'premium', execution: null, icon: '🗣️', id: 'speech' }),
  Object.freeze({ access: 'premium', execution: null, icon: '🎶', id: 'melody' }),
])

export const defaultAiEarModeId = 'sound'

export function getAiEarMode(id) {
  return aiEarModes.find((mode) => mode.id === id) || aiEarModes[0]
}
