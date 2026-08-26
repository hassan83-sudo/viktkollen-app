import { socialTables } from '../model/socialModel.js'
import { shouldStartSocialSubscriptions } from '../model/socialPolicy.js'

export function subscribeConversationMessages({
  client,
  conversationId,
  enabled,
  isAuthenticated,
  onInsert,
  supabaseConfigured,
} = {}) {
  if (!shouldStartSocialSubscriptions({
    featureEnabled: enabled,
    isAuthenticated,
    supabaseConfigured,
  }) || !client?.channel || !conversationId) {
    return () => {}
  }

  const channel = client.channel(`social-messages:${conversationId}`)
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: socialTables.messages,
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      onInsert?.(payload?.new || null)
    },
  )
  channel.subscribe()

  return () => {
    client.removeChannel?.(channel)
  }
}

export function subscribeInbox({
  client,
  enabled,
  isAuthenticated,
  onChange,
  supabaseConfigured,
  userId,
} = {}) {
  if (!shouldStartSocialSubscriptions({
    featureEnabled: enabled,
    isAuthenticated,
    supabaseConfigured,
  }) || !client?.channel || !userId) {
    return () => {}
  }

  const channel = client.channel(`social-inbox:${userId}`)
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: socialTables.conversationMembers,
      filter: `user_id=eq.${userId}`,
    },
    () => onChange?.(),
  )
  channel.subscribe()

  return () => {
    client.removeChannel?.(channel)
  }
}
