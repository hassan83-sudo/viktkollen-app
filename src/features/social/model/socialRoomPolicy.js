import { shouldStartSocialSubscriptions } from './socialPolicy.js'

export function canLoadSocialRoomData({
  enabled,
  isAuthenticated,
  liveEnabled,
  supabaseConfigured,
} = {}) {
  return enabled === true && shouldStartSocialSubscriptions({
    isAuthenticated,
    liveEnabled,
    supabaseConfigured,
  })
}
