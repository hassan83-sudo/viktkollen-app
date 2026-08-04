import { getLocalDateString } from '../localDate.js'
import { normalizePrivacySettings } from './privacyEngine.js'

export const friendStatuses = ['pending', 'accepted', 'blocked', 'removed']
export const inviteStatuses = ['draft', 'sent', 'accepted', 'expired', 'revoked']

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function safeText(value, fallback = '', max = 120) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max)
}

function stableId(prefix, seed = '') {
  return `${prefix}-${safeText(seed || 'local', 'local', 80).toLocaleLowerCase('sv-SE').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 100)
}

export function normalizeFriend(friend = {}) {
  if (!isObject(friend)) return null
  const displayName = safeText(friend.displayName || friend.name || friend.alias, 'Vän')

  return {
    accountabilityPartner: friend.accountabilityPartner === true,
    createdAt: safeText(friend.createdAt || new Date().toISOString()),
    displayName,
    id: safeText(friend.id) || stableId('friend', displayName),
    sharedGoalIds: safeArray(friend.sharedGoalIds).map((id) => safeText(id)).filter(Boolean).slice(0, 20),
    status: friendStatuses.includes(friend.status) ? friend.status : 'pending',
    updatedAt: safeText(friend.updatedAt || friend.createdAt || new Date().toISOString()),
    visibility: normalizePrivacySettings(friend.visibility || friend.privacy),
  }
}

export function normalizeInvite(invite = {}) {
  if (!isObject(invite)) return null
  const createdAt = safeText(invite.createdAt || new Date().toISOString())

  return {
    createdAt,
    expiresAt: safeText(invite.expiresAt),
    id: safeText(invite.id) || stableId('invite', `${invite.audience || invite.createdAt || createdAt}`),
    note: safeText(invite.note, '', 180),
    recipientHint: safeText(invite.recipientHint || invite.emailHint || 'Privat länk', 'Privat länk'),
    status: inviteStatuses.includes(invite.status) ? invite.status : 'draft',
    tokenId: safeText(invite.tokenId),
    visibility: ['private', 'shared', 'public'].includes(invite.visibility) ? invite.visibility : 'shared',
  }
}

export function buildFriendModel(socialState = {}, options = {}) {
  const source = isObject(socialState) ? socialState : {}
  const friends = safeArray(source.friends).map(normalizeFriend).filter(Boolean)
  const invites = safeArray(source.invites).map(normalizeInvite).filter(Boolean)
  const activeFriends = friends.filter((friend) => friend.status === 'accepted')
  const partners = activeFriends.filter((friend) => friend.accountabilityPartner)
  const today = getLocalDateString(options.analysisDate || source.today || new Date())

  return {
    activeFriendCount: activeFriends.length,
    friends,
    invites,
    partnerCount: partners.length,
    partners,
    pendingInviteCount: invites.filter((invite) => ['draft', 'sent'].includes(invite.status)).length,
    today,
  }
}
