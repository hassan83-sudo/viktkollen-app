import { createSupabaseAdminClient } from '../supabaseServer.js'
import { createPostgresUsageRepository } from '../../../src/services/billing/usageRepositoryPostgres.js'
import { getUsageRepository, isDefaultUsageRepository } from '../../../src/services/billing/usageRepository.js'

export function resolveDurableUsageRepository() {
  if (!isDefaultUsageRepository()) return getUsageRepository()
  if (process.env.NODE_ENV === 'test') return getUsageRepository()
  const client = createSupabaseAdminClient()
  if (!client) return getUsageRepository()
  try {
    return createPostgresUsageRepository({ client })
  } catch {
    return getUsageRepository()
  }
}
