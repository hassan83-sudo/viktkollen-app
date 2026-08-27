import { supabase as defaultClient, isSupabaseConfigured } from '../../../services/supabaseClient.js'
import { safeLogger } from '../../../services/safeLogger.js'
import {
  HOME_SOCIAL_PREVIEW_LIMIT,
  previewMessage,
  sanitizePublicProfile,
  socialTables,
  validateSocialProfileInput,
} from '../model/socialModel.js'

function socialError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function logSocialEvent(message, details = {}) {
  safeLogger.info(message, {
    conversationId: details.conversationId || details.conversation_id || undefined,
    count: details.count,
    requestId: details.requestId || details.id,
    status: details.status,
  })
}

export function createSocialApi({ client = defaultClient, getUserId } = {}) {
  async function requireUserId() {
    if (typeof getUserId === 'function') {
      const id = await getUserId()
      if (id) return id
    }
    if (!client?.auth?.getUser) throw socialError('unauthenticated', 'Logga in för att använda vänner och chatt.')
    const { data, error } = await client.auth.getUser()
    if (error || !data?.user?.id) throw socialError('unauthenticated', 'Logga in för att använda vänner och chatt.')
    return data.user.id
  }

  async function requireClient() {
    if (!client) throw socialError('unavailable', 'Chatten kräver en ansluten molnkonto.')
    return client
  }

  return {
    async getMyPublicProfile() {
      const db = await requireClient()
      const userId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.profiles)
        .select('user_id, display_name, username, avatar_url')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw socialError('profile_failed', 'Kunde inte hämta din sociala profil.')
      return data ? sanitizePublicProfile(data) : null
    },

    async upsertPublicProfile({ displayName, username, avatarUrl = '' } = {}) {
      const db = await requireClient()
      await requireUserId()
      const validated = validateSocialProfileInput({ displayName, username })
      if (!validated.ok) {
        throw socialError(validated.reason, validated.reason === 'invalid_username'
          ? 'Användarnamnet måste vara 3–24 tecken: a-z, 0-9 eller _.'
          : 'Ange ett visningsnamn.')
      }
      const { data, error } = await db.rpc('social_upsert_public_profile', {
        p_avatar_url: avatarUrl || null,
        p_display_name: validated.displayName,
        p_username: validated.username,
      })
      if (error) throw socialError('profile_upsert_failed', 'Kunde inte spara den publika profilen.')
      logSocialEvent('social.profile.upserted', { status: 'ok' })
      return sanitizePublicProfile(data)
    },

    async searchPeople(query) {
      const db = await requireClient()
      await requireUserId()
      const needle = String(query || '')
        .trim()
        .replace(/^@/, '')
        .replace(/[,%()]/g, '')
        .slice(0, 24)
      if (needle.length < 2) return []
      const { data, error } = await db
        .from(socialTables.profiles)
        .select('user_id, display_name, username, avatar_url')
        .or(`username.ilike.%${needle}%,display_name.ilike.%${needle}%`)
        .limit(12)
      if (error) throw socialError('search_failed', 'Kunde inte söka efter personer.')
      return (data || []).map(sanitizePublicProfile).filter(Boolean)
    },

    async listFriends() {
      const db = await requireClient()
      const userId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.friendships)
        .select('user_low, user_high, created_at')
        .or(`user_low.eq.${userId},user_high.eq.${userId}`)
      if (error) throw socialError('friends_failed', 'Kunde inte hämta vänner.')
      const otherIds = [...new Set((data || []).map((row) => (row.user_low === userId ? row.user_high : row.user_low)))]
      const profiles = await this.listProfilesByIds(otherIds)
      return otherIds.map((id) => profiles.find((profile) => profile.userId === id)).filter(Boolean)
    },

    async listProfilesByIds(ids = []) {
      const db = await requireClient()
      const unique = [...new Set((ids || []).filter(Boolean))]
      if (!unique.length) return []
      const { data, error } = await db
        .from(socialTables.profiles)
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', unique)
      if (error) throw socialError('profiles_failed', 'Kunde inte hämta profiler.')
      return (data || []).map(sanitizePublicProfile).filter(Boolean)
    },

    async sendFriendRequest(toUserId) {
      const db = await requireClient()
      const fromUserId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.friendRequests)
        .insert({ to_user_id: toUserId })
        .select('id, from_user_id, to_user_id, status, created_at')
        .single()
      if (error) throw socialError('request_failed', 'Kunde inte skicka vänförfrågan.')
      logSocialEvent('social.friend_request.sent', { id: data?.id, status: data?.status })
      return { ...data, fromUserId, toUserId }
    },

    async listFriendRequests() {
      const db = await requireClient()
      const userId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.friendRequests)
        .select('id, from_user_id, to_user_id, status, created_at')
        .eq('status', 'pending')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
      if (error) throw socialError('requests_failed', 'Kunde inte hämta vänförfrågningar.')
      const incoming = (data || []).filter((row) => row.to_user_id === userId)
      const outgoing = (data || []).filter((row) => row.from_user_id === userId)
      const profiles = await this.listProfilesByIds([
        ...incoming.map((row) => row.from_user_id),
        ...outgoing.map((row) => row.to_user_id),
      ])
      const byId = Object.fromEntries(profiles.map((profile) => [profile.userId, profile]))
      return {
        incoming: incoming.map((row) => ({ ...row, profile: byId[row.from_user_id] || null })),
        outgoing: outgoing.map((row) => ({ ...row, profile: byId[row.to_user_id] || null })),
      }
    },

    async respondToFriendRequest(requestId, action) {
      const db = await requireClient()
      await requireUserId()
      const status = action === 'accept' ? 'accepted' : 'declined'
      const { error } = await db.rpc('social_respond_friend_request', {
        p_request_id: requestId,
        p_status: status,
      })
      if (error) throw socialError('respond_failed', action === 'accept' ? 'Kunde inte acceptera.' : 'Kunde inte neka.')
      logSocialEvent('social.friend_request.responded', { requestId, status })
      return { requestId, status }
    },

    async removeFriend(otherUserId) {
      const db = await requireClient()
      await requireUserId()
      const { error } = await db.rpc('social_remove_friend', { p_other_user_id: otherUserId })
      if (error) throw socialError('remove_failed', 'Kunde inte ta bort vännen.')
      logSocialEvent('social.friend.removed', { status: 'removed' })
    },

    async blockUser(otherUserId) {
      const db = await requireClient()
      const userId = await requireUserId()
      const { error } = await db.from(socialTables.blocks).insert({ blocked_id: otherUserId })
      if (error) throw socialError('block_failed', 'Kunde inte blockera användaren.')
      // Friendship/request cleanup is enforced by DB trigger social_after_block.
      logSocialEvent('social.block.created', { status: 'blocked' })
      return { blockerId: userId, blockedId: otherUserId }
    },

    async listBlocks() {
      const db = await requireClient()
      const userId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.blocks)
        .select('blocker_id, blocked_id, created_at')
        .eq('blocker_id', userId)
      if (error) throw socialError('blocks_failed', 'Kunde inte hämta blockeringar.')
      return data || []
    },

    async openDirectConversation(otherUserId) {
      const db = await requireClient()
      await requireUserId()
      const { data, error } = await db.rpc('social_open_dm', { p_other_user_id: otherUserId })
      if (error || !data) throw socialError('conversation_failed', 'Kunde inte öppna chatten.')
      return data
    },

    async listConversations() {
      const db = await requireClient()
      const userId = await requireUserId()
      const { data, error } = await db
        .from(socialTables.conversationMembers)
        .select('conversation_id, last_read_at, unread_count, social_conversations(id, updated_at)')
        .eq('user_id', userId)
        .order('unread_count', { ascending: false })
      if (error) throw socialError('inbox_failed', 'Kunde inte hämta chatten.')
      const rows = data || []
      const conversationIds = rows.map((row) => row.conversation_id)
      const members = conversationIds.length
        ? (await db
          .from(socialTables.conversationMembers)
          .select('conversation_id, user_id')
          .in('conversation_id', conversationIds)).data || []
        : []
      const otherIds = members
        .filter((member) => member.user_id !== userId)
        .map((member) => member.user_id)
      const profiles = await this.listProfilesByIds(otherIds)
      const byId = Object.fromEntries(profiles.map((profile) => [profile.userId, profile]))
      const previews = await Promise.all(conversationIds.map((id) => this.getLastMessage(id)))
      return rows.map((row, index) => {
        const otherMember = members.find((member) => member.conversation_id === row.conversation_id && member.user_id !== userId)
        const last = previews[index]
        return {
          conversationId: row.conversation_id,
          lastMessage: last ? previewMessage(last) : '',
          lastMessageAt: last?.created_at || row.social_conversations?.updated_at || null,
          other: byId[otherMember?.user_id] || null,
          unreadCount: Number(row.unread_count) || 0,
        }
      }).sort((first, second) => String(second.lastMessageAt || '').localeCompare(String(first.lastMessageAt || '')))
    },

    async listHomePreview() {
      const conversations = await this.listConversations()
      return conversations.slice(0, HOME_SOCIAL_PREVIEW_LIMIT)
    },

    async getLastMessage(conversationId) {
      const db = await requireClient()
      await requireUserId()
      const { data, error } = await db
        .from(socialTables.messages)
        .select('id, conversation_id, sender_id, type, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return null
      if (!data) return null
      const { data: bodyRow } = await db
        .from(socialTables.messages)
        .select('body')
        .eq('id', data.id)
        .maybeSingle()
      return { ...data, body: bodyRow?.body || '' }
    },

    async listMessages(conversationId) {
      const db = await requireClient()
      await requireUserId()
      const { data, error } = await db
        .from(socialTables.messages)
        .select('id, conversation_id, sender_id, type, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw socialError('messages_failed', 'Kunde inte hämta meddelanden.')
      return data || []
    },

    async sendText(conversationId, text) {
      const db = await requireClient()
      const userId = await requireUserId()
      const body = String(text || '').trim()
      if (!body) throw socialError('empty', 'Skriv ett meddelande först.')
      const { data, error } = await db
        .from(socialTables.messages)
        .insert({
          body,
          conversation_id: conversationId,
          type: 'text',
        })
        .select('id, conversation_id, sender_id, type, created_at')
        .single()
      if (error) throw socialError('send_failed', 'Meddelandet kunde inte skickas.')
      logSocialEvent('social.message.sent', { conversationId, count: 1 })
      return { ...data, sender_id: data.sender_id || userId, body }
    },

    async markRead(conversationId) {
      const db = await requireClient()
      await requireUserId()
      const { error } = await db.rpc('social_mark_read', { p_conversation_id: conversationId })
      if (error) throw socialError('read_failed', 'Kunde inte markera som läst.')
      logSocialEvent('social.conversation.read', { conversationId })
    },
  }
}

export const socialApi = createSocialApi()

export function isSocialBackendReady() {
  return isSupabaseConfigured()
}
