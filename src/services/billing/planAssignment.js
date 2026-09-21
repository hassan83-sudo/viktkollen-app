import { defaultPlanCatalog } from './planCatalog.js'

export function createInMemoryPlanAssignmentStore(defaultPlanId = 'plan.free') {
  const byUser = new Map()

  return {
    async get(userId) {
      const id = String(userId || '').trim()
      if (!id) return null
      return byUser.get(id) || {
        plan_id: defaultPlanId,
        plan_version: defaultPlanCatalog.find((plan) => plan.id === defaultPlanId)?.version || 1,
        source: 'server-default',
        user_id: id,
      }
    },
    async set(assignment) {
      const userId = String(assignment.user_id || '').trim()
      if (!userId) {
        const error = new Error('invalid_user_id')
        error.code = 'invalid_user_id'
        throw error
      }
      const stored = Object.freeze({
        assigned_at: assignment.assigned_at || new Date().toISOString(),
        plan_id: assignment.plan_id,
        plan_version: assignment.plan_version,
        source: assignment.source || 'server',
        user_id: userId,
      })
      byUser.set(userId, stored)
      return stored
    },
    reset() {
      byUser.clear()
    },
  }
}
