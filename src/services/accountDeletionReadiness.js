import {
  getBackupStorageKeys,
  userDataKeys,
} from './userDataRepository.js'

export const accountDeletionCapability = Object.freeze({
  AVAILABLE_CLIENT_SIDE: 'available_client_side',
  BLOCKED_PRIVILEGED_BACKEND_REQUIRED: 'blocked_privileged_backend_required',
  MANUAL_PROVIDER_ACTION_REQUIRED: 'manual_provider_action_required',
})

export const accountDeletionAreas = Object.freeze({
  ACCOUNT: 'account',
  CLOUD_DATA: 'cloudData',
  LOCAL_DATA: 'localData',
  PROVIDER_CUSTOMER: 'providerCustomer',
})

export function buildAccountDeletionReadiness({
  hasBillingProvider = false,
  hasPrivilegedAccountDeleteApi = false,
  hasPrivilegedCloudDeleteApi = false,
  localStorageKeys = getBackupStorageKeys(),
} = {}) {
  const localKeys = [...new Set([
    ...localStorageKeys,
    userDataKeys.cloudBackupMeta,
    userDataKeys.demoMode,
  ])].filter(Boolean)

  return {
    areas: {
      [accountDeletionAreas.LOCAL_DATA]: {
        capability: accountDeletionCapability.AVAILABLE_CLIENT_SIDE,
        canCodexImplementNext: true,
        requiresExternalAccount: false,
        requiresUserAction: false,
        storageKeys: localKeys,
      },
      [accountDeletionAreas.CLOUD_DATA]: {
        capability: hasPrivilegedCloudDeleteApi
          ? accountDeletionCapability.AVAILABLE_CLIENT_SIDE
          : accountDeletionCapability.BLOCKED_PRIVILEGED_BACKEND_REQUIRED,
        canCodexImplementNext: false,
        requiresExternalAccount: true,
        requiresUserAction: true,
        requiredBackend: 'Authenticated API that deletes user-owned rows from Supabase tables under server-side authorization.',
      },
      [accountDeletionAreas.ACCOUNT]: {
        capability: hasPrivilegedAccountDeleteApi
          ? accountDeletionCapability.AVAILABLE_CLIENT_SIDE
          : accountDeletionCapability.BLOCKED_PRIVILEGED_BACKEND_REQUIRED,
        canCodexImplementNext: false,
        requiresExternalAccount: true,
        requiresUserAction: true,
        requiredBackend: 'Privileged auth admin endpoint using server-only credentials. Never expose admin credentials in the client.',
      },
      [accountDeletionAreas.PROVIDER_CUSTOMER]: {
        capability: hasBillingProvider
          ? accountDeletionCapability.MANUAL_PROVIDER_ACTION_REQUIRED
          : accountDeletionCapability.BLOCKED_PRIVILEGED_BACKEND_REQUIRED,
        canCodexImplementNext: false,
        requiresExternalAccount: true,
        requiresUserAction: true,
        requiredBackend: 'Billing-provider customer cleanup and entitlement revocation after provider selection.',
      },
    },
    blockers: [
      hasPrivilegedCloudDeleteApi ? '' : 'Cloud data deletion endpoint saknas.',
      hasPrivilegedAccountDeleteApi ? '' : 'Auth account deletion endpoint saknas.',
      hasBillingProvider ? '' : 'Betalprovider och kundregister saknas.',
    ].filter(Boolean),
    safeClientActions: [
      'Exportera data före radering.',
      'Radera lokala Viktkollen-storage keys.',
      'Logga ut efter lokal radering.',
    ],
    status: hasPrivilegedAccountDeleteApi && hasPrivilegedCloudDeleteApi
      ? 'ready_with_backend'
      : 'blocked_on_privileged_backend',
  }
}
