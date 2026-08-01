let cloudSyncServiceModule
let cloudSyncEngineModule

export async function loadCloudSyncService() {
  cloudSyncServiceModule ||= import('./cloudSyncService.js')
  return cloudSyncServiceModule
}

export async function loadCloudSyncEngine() {
  cloudSyncEngineModule ||= import('./sync/cloudSyncEngine.js')
  return cloudSyncEngineModule
}
