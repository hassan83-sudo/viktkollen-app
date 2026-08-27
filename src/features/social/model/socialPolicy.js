import { pairUserIds } from './socialModel.js'

function idsEqual(left, right) {
  return String(left || '') === String(right || '')
}

export function isBlockedRelation(blocks = [], userA, userB) {
  return (Array.isArray(blocks) ? blocks : []).some((entry) => {
    const blocker = entry.blockerId || entry.blocker_id
    const blocked = entry.blockedId || entry.blocked_id
    return (idsEqual(blocker, userA) && idsEqual(blocked, userB))
      || (idsEqual(blocker, userB) && idsEqual(blocked, userA))
  })
}

export function areFriends(friendships = [], userA, userB) {
  const [low, high] = pairUserIds(userA, userB)
  return (Array.isArray(friendships) ? friendships : []).some((entry) => {
    const left = entry.userLow || entry.user_low
    const right = entry.userHigh || entry.user_high
    return idsEqual(left, low) && idsEqual(right, high)
  })
}

export function canSendFriendRequest({
  actorId,
  blocks = [],
  friendships = [],
  pendingRequests = [],
  targetId,
} = {}) {
  if (!actorId || !targetId || idsEqual(actorId, targetId)) return false
  if (isBlockedRelation(blocks, actorId, targetId)) return false
  if (areFriends(friendships, actorId, targetId)) return false
  return !(Array.isArray(pendingRequests) ? pendingRequests : []).some((request) => {
    if (request.status && request.status !== 'pending') return false
    const fromId = request.fromUserId || request.from_user_id
    const toId = request.toUserId || request.to_user_id
    return (idsEqual(fromId, actorId) && idsEqual(toId, targetId))
      || (idsEqual(fromId, targetId) && idsEqual(toId, actorId))
  })
}

export function canRespondToFriendRequest({ actorId, request } = {}) {
  const toId = request?.toUserId || request?.to_user_id
  return Boolean(actorId && request && idsEqual(actorId, toId) && (request.status || 'pending') === 'pending')
}

export function canCancelFriendRequest({ actorId, request } = {}) {
  const fromId = request?.fromUserId || request?.from_user_id
  return Boolean(actorId && request && idsEqual(actorId, fromId) && (request.status || 'pending') === 'pending')
}

export function canReadConversation({ memberIds = [], userId } = {}) {
  return (Array.isArray(memberIds) ? memberIds : []).some((id) => idsEqual(id, userId))
}

export function canSendConversationMessage({
  blocks = [],
  friendships = [],
  memberIds = [],
  senderId,
} = {}) {
  if (!canReadConversation({ memberIds, userId: senderId })) return false
  const others = (Array.isArray(memberIds) ? memberIds : []).filter((id) => !idsEqual(id, senderId))
  if (others.length !== 1) return false
  const otherId = others[0]
  if (isBlockedRelation(blocks, senderId, otherId)) return false
  return areFriends(friendships, senderId, otherId)
}

export function shouldHideSocialUi(featureEnabled) {
  return featureEnabled !== true
}

export function shouldStartSocialSubscriptions({
  featureEnabled,
  isAuthenticated,
  liveEnabled,
  supabaseConfigured,
} = {}) {
  return (liveEnabled ?? featureEnabled) === true
    && isAuthenticated === true
    && supabaseConfigured === true
}
