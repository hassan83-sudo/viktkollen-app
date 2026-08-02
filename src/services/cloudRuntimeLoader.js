import { recordCloudRuntimeLoaded } from './sync/syncDiagnostics.js'

let cloudSyncServiceModule
let cloudSyncEngineModule

export async function loadCloudSyncService() {
  cloudSyncServiceModule ||= import('./cloudSyncService.js')
  recordCloudRuntimeLoaded('service')
  return cloudSyncServiceModule
}

export async function loadCloudSyncEngine() {
  cloudSyncEngineModule ||= import('./sync/cloudSyncEngine.js')
  recordCloudRuntimeLoaded('engine')
  return cloudSyncEngineModule
}
