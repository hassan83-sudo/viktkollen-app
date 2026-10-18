// The only customer actions the assistant may offer. Chat text and model output cannot add to this list.
export const AI_ACTIONS = Object.freeze({
  schedule_cancel: Object.freeze({
    id: 'schedule_cancel',
    sensitive: true,
  }),
})

export function sanitizeAiAction(value) {
  const id = typeof value === 'string' ? value : value?.action || value?.id
  const known = AI_ACTIONS[String(id || '')]
  if (!known) return null
  return { action: known.id, sensitive: known.sensitive }
}
