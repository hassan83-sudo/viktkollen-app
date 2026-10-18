import { hashAiHelpScope } from './costGuard.js'

const recent = []

export function safeAiActionRecord({ action, actorUserId, code, ok } = {}) {
  return {
    action: String(action || 'rejected').slice(0, 40),
    actorHash: actorUserId ? hashAiHelpScope(actorUserId) : '',
    code: String(code || '').slice(0, 40),
    ok: ok === true,
  }
}

export function recordAiAction(entry, sink = recent) {
  const safe = safeAiActionRecord(entry)
  sink.push(safe)
  if (sink === recent && recent.length > 20) recent.splice(0, recent.length - 20)
  return safe
}

export function recentAiActions() {
  return recent.slice()
}

export function clearAiActionsForTests() {
  recent.length = 0
}
