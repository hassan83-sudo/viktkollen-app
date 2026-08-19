import { describe, expect, it } from 'vitest'

import {
  accountDeletionCapability,
  accountDeletionAreas,
  buildAccountDeletionReadiness,
} from './accountDeletionReadiness.js'

describe('accountDeletionReadiness', () => {
  it('shows backend contract readiness without pretending provider cleanup exists', () => {
    const readiness = buildAccountDeletionReadiness({
      localStorageKeys: ['viktkollen.weights', 'viktkollen.meals'],
    })

    expect(readiness.status).toBe('ready_with_backend')
    expect(readiness.areas[accountDeletionAreas.LOCAL_DATA].capability).toBe(accountDeletionCapability.AVAILABLE_CLIENT_SIDE)
    expect(readiness.areas[accountDeletionAreas.ACCOUNT].capability).toBe(accountDeletionCapability.AVAILABLE_CLIENT_SIDE)
    expect(readiness.areas[accountDeletionAreas.CLOUD_DATA].capability).toBe(accountDeletionCapability.AVAILABLE_CLIENT_SIDE)
    expect(readiness.blockers).toContain('Betalprovider och kundregister saknas.')
  })

  it('keeps service-role deletion requirements out of client capabilities', () => {
    const readiness = buildAccountDeletionReadiness({
      hasPrivilegedAccountDeleteApi: true,
      hasPrivilegedCloudDeleteApi: true,
    })

    expect(readiness.status).toBe('ready_with_backend')
    expect(JSON.stringify(readiness)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/)
  })
})
