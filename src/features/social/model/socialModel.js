export const socialMessageTypes = Object.freeze(['text', 'image', 'system'])
export const socialFriendRequestStatuses = Object.freeze(['pending', 'accepted', 'declined', 'cancelled'])
export const socialCallStates = Object.freeze([
  'idle',
  'outgoing',
  'incoming',
  'connecting',
  'active',
  'ended',
])

export const socialTables = Object.freeze({
  blocks: 'social_blocks',
  conversationMembers: 'social_conversation_members',
  conversations: 'social_conversations',
  dmPairs: 'social_dm_pairs',
  friendRequests: 'social_friend_requests',
  friendships: 'social_friendships',
  messages: 'social_messages',
  profiles: 'social_public_profiles',
})

export const SOCIAL_USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/

export function normalizeSocialUsername(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US')
}

export function isValidSocialUsername(value) {
  return SOCIAL_USERNAME_PATTERN.test(normalizeSocialUsername(value))
}

export function validateSocialProfileInput({ displayName, username } = {}) {
  const normalizedUsername = normalizeSocialUsername(username)
  const safeDisplayName = String(displayName || '').trim().slice(0, 48)
  if (!isValidSocialUsername(normalizedUsername)) {
    return { ok: false, reason: 'invalid_username' }
  }
  if (!safeDisplayName) {
    return { ok: false, reason: 'invalid_display_name' }
  }
  return {
    displayName: safeDisplayName,
    ok: true,
    username: normalizedUsername,
  }
}

export const HOME_SOCIAL_PREVIEW_LIMIT = 3

export const videoCallV2Plan = Object.freeze({
  implemented: false,
  notes: [
    'V2 uses WebRTC with a separate signaling channel, not chat message bodies.',
    'Signaling stays on a dedicated table/channel with call ids; STUN plus a TURN provider is required for iOS cellular.',
    'Incoming calls need a push payload with call id only — never chat text.',
    'Accept/decline, mute, camera toggle, front/back camera, hang up, reconnect and call timeout live in a call controller.',
    'iOS background/foreground must keep the call alive via CallKit-style UX later; V1 shows no fake call buttons.',
  ],
})

export function pairUserIds(firstId, secondId) {
  const left = String(firstId || '')
  const right = String(secondId || '')
  return left < right ? [left, right] : [right, left]
}

export function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

export function sanitizePublicProfile(row = {}) {
  if (!row || typeof row !== 'object') return null
  const userId = String(row.user_id || row.userId || '')
  const username = String(row.username || row.public_user_id || '').trim()
  const displayName = String(row.display_name || row.displayName || username || '').trim()
  if (!userId && !username) return null

  return {
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : (typeof row.avatarUrl === 'string' ? row.avatarUrl : ''),
    displayName: displayName || 'Medlem',
    userId,
    username,
  }
}

export function stripPrivateIdentityFields(row = {}) {
  const sanitized = sanitizePublicProfile(row)
  const leaked = ['email', 'phone', 'phone_number', 'telephone', 'raw_user_meta_data']
    .some((key) => Object.prototype.hasOwnProperty.call(row, key) && row[key])
  return {
    leakedPrivateFields: leaked,
    profile: sanitized,
  }
}

export function normalizeMessageType(value) {
  return socialMessageTypes.includes(value) ? value : 'text'
}

export function previewMessage(message = {}) {
  if (!message || message.type === 'image') return 'Bild'
  if (message.type === 'system') return 'System'
  const body = String(message.body || message.lastMessage || '').trim()
  if (!body) return ''
  return body.length > 72 ? `${body.slice(0, 71)}…` : body
}
