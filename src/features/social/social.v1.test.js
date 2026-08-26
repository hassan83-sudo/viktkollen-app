import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { socialMessageDeletionPolicy, socialPurgeRpc } from './model/socialDeletion.js'
import {
  isValidSocialUsername,
  normalizeSocialUsername,
  sanitizePublicProfile,
  stripPrivateIdentityFields,
  validateSocialProfileInput,
  videoCallV2Plan,
} from './model/socialModel.js'
import {
  canReadConversation,
  canSendConversationMessage,
  canSendFriendRequest,
  shouldStartSocialSubscriptions,
} from './model/socialPolicy.js'
import { createSocialApi } from './services/socialApi.js'
import { subscribeConversationMessages, subscribeInbox } from './services/socialRealtime.js'

const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const userC = '33333333-3333-4333-8333-333333333333'

describe('social username / public profile', () => {
  it('validates and normalizes usernames without copying email or phone', () => {
    expect(normalizeSocialUsername('Anna_82')).toBe('anna_82')
    expect(isValidSocialUsername('ab')).toBe(false)
    expect(isValidSocialUsername('anna_82')).toBe(true)
    expect(validateSocialProfileInput({ username: 'Anna_82', displayName: 'Anna' })).toEqual({
      displayName: 'Anna',
      ok: true,
      username: 'anna_82',
    })
    expect(validateSocialProfileInput({ username: 'bad name', displayName: 'Anna' }).ok).toBe(false)
  })

  it('keeps search profiles free of email and phone', () => {
    const stripped = stripPrivateIdentityFields({
      avatar_url: '',
      display_name: 'Anna',
      email: 'anna@example.com',
      phone: '0700000000',
      user_id: userA,
      username: 'anna',
    })
    expect(stripped.leakedPrivateFields).toBe(true)
    expect(sanitizePublicProfile(stripped.profile)).toEqual({
      avatarUrl: '',
      displayName: 'Anna',
      userId: userA,
      username: 'anna',
    })
  })
})

describe('social policy and privacy', () => {
  it('rejects self friend requests and stops blocked contact both ways', () => {
    expect(canSendFriendRequest({ actorId: userA, targetId: userA })).toBe(false)
    const blocks = [{ blockerId: userA, blockedId: userB }]
    expect(canSendFriendRequest({ actorId: userB, targetId: userA, blocks })).toBe(false)
    expect(canSendFriendRequest({ actorId: userA, targetId: userB, blocks })).toBe(false)
    expect(canSendConversationMessage({
      blocks,
      friendships: [{ user_low: userA, user_high: userB }],
      memberIds: [userA, userB],
      senderId: userB,
    })).toBe(false)
  })

  it('lets only participants read or send in a conversation', () => {
    expect(canReadConversation({ memberIds: [userA, userB], userId: userA })).toBe(true)
    expect(canReadConversation({ memberIds: [userA, userB], userId: userB })).toBe(true)
    expect(canReadConversation({ memberIds: [userA, userB], userId: userC })).toBe(false)
    expect(canSendConversationMessage({
      friendships: [{ user_low: userA, user_high: userB }],
      memberIds: [userA, userB],
      senderId: userC,
    })).toBe(false)
  })

  it('does not start social subscriptions when the feature is off', () => {
    expect(shouldStartSocialSubscriptions({
      featureEnabled: false,
      isAuthenticated: true,
      supabaseConfigured: true,
    })).toBe(false)
    const unsubscribe = subscribeConversationMessages({
      client: { channel: vi.fn() },
      conversationId: 'c1',
      enabled: false,
      isAuthenticated: true,
      supabaseConfigured: true,
    })
    expect(typeof unsubscribe).toBe('function')
  })

  it('documents delete policy for messages on account deletion', () => {
    expect(socialMessageDeletionPolicy.choice).toBe('A_delete')
    expect(socialPurgeRpc).toBe('social_purge_user_data')
  })

  it('prepares call states without implementing WebRTC', () => {
    expect(videoCallV2Plan.implemented).toBe(false)
  })
})

describe('social SQL security gate', () => {
  const sql = readFileSync(new URL('../../../supabase/social_friends_chat.sql', import.meta.url), 'utf8')

  it('keeps public profiles free of email/phone columns and forces auth actors', () => {
    expect(sql).toContain('create table if not exists public.social_public_profiles')
    expect(sql).not.toMatch(/email text/)
    expect(sql).not.toMatch(/phone text/)
    expect(sql).toContain('new.from_user_id := auth.uid()')
    expect(sql).toContain('new.sender_id := auth.uid()')
    expect(sql).toContain('new.blocker_id := auth.uid()')
    expect(sql).toContain('new.user_id := auth.uid()')
    expect(sql).toContain('messages are immutable')
  })

  it('normalizes friend-request race and friendship uniqueness', () => {
    expect(sql).toContain('social_friend_requests_pending_pair_idx')
    expect(sql).toContain('least(from_user_id, to_user_id)')
    expect(sql).toContain('constraint social_friendships_ordered check (user_low < user_high)')
    expect(sql).toContain('social_friend_requests_not_self')
  })

  it('prevents duplicate DM races with advisory lock and dm_pairs uniqueness', () => {
    expect(sql).toContain('create table if not exists public.social_dm_pairs')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('when unique_violation then')
  })

  it('revokes public access and sets SECURITY DEFINER search_path', () => {
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('security definer')
    expect(sql).toContain('revoke all on table public.social_messages from public, anon')
    expect(sql).toContain('grant execute on function public.social_purge_user_data(uuid) to service_role')
    expect(sql).toContain('social_upsert_public_profile')
    expect(sql).toContain('Never copy email/phone into public profile')
  })

  it('does not leave SECURITY DEFINER RPCs executable by public or anon', () => {
    [
      'social_upsert_public_profile(text, text, text)',
      'social_respond_friend_request(uuid, text)',
      'social_remove_friend(uuid)',
      'social_open_dm(uuid)',
      'social_mark_read(uuid)',
      'social_purge_user_data(uuid)',
    ].forEach((signature) => {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon`)
    })
    expect(sql).toContain('if auth.uid() is null then')
    expect(sql).not.toContain('grant execute on function public.social_purge_user_data(uuid) to authenticated')
  })

  it('keeps account-deletion purge service-role-only', () => {
    expect(sql).toContain("if auth.role() is distinct from 'service_role' then")
    expect(sql).toContain('revoke all on function public.social_purge_user_data(uuid) from authenticated')
    expect(sql).toContain('grant execute on function public.social_purge_user_data(uuid) to service_role')
    expect(sql).toContain('Callable by: service_role only')
  })

  it('documents privacy-first purge of entire DM threads', () => {
    expect(sql).toContain('social_purge_user_data')
    expect(sql).toContain('delete from public.social_messages where conversation_id = any (conv_ids)')
    expect(sql).toContain('force row level security')
  })
})

describe('social api adapter', () => {
  it('covers friend request, accept, decline, remove, block, send, unread and mark read', async () => {
    const rpc = vi.fn(async (name, args) => {
      if (name === 'social_open_dm') return { data: 'conv-1', error: null }
      if (name === 'social_upsert_public_profile') {
        return {
          data: {
            avatar_url: '',
            display_name: args.p_display_name,
            user_id: userA,
            username: args.p_username,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    const maybeSingle = vi.fn(async () => ({ data: { body: 'Hej' }, error: null }))
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: userA } }, error: null }) },
      from: vi.fn((table) => {
        const result = {
          delete: vi.fn(() => result),
          eq: vi.fn(() => result),
          in: vi.fn(() => result),
          insert: vi.fn(() => result),
          limit: vi.fn(() => result),
          maybeSingle,
          or: vi.fn(() => result),
          order: vi.fn(() => result),
          select: vi.fn(() => result),
          single: vi.fn(async () => {
            if (table === 'social_friend_requests') {
              return { data: { id: 'req-1', from_user_id: userA, status: 'pending', to_user_id: userB }, error: null }
            }
            if (table === 'social_messages') {
              return { data: { conversation_id: 'conv-1', created_at: '2026-08-26T08:00:00Z', id: 'm1', sender_id: userA, type: 'text' }, error: null }
            }
            if (table === 'social_blocks') {
              return { data: { blocked_id: userB, blocker_id: userA }, error: null }
            }
            return { data: [], error: null }
          }),
        }
        result.then = (resolve) => resolve({
          data: table === 'social_public_profiles'
            ? [{ avatar_url: '', display_name: 'Ali', user_id: userB, username: 'ali' }]
            : table === 'social_friendships'
              ? [{ user_high: userB, user_low: userA }]
              : table === 'social_friend_requests'
                ? []
                : table === 'social_conversation_members'
                  ? [{ conversation_id: 'conv-1', last_read_at: null, unread_count: 2, user_id: userA }]
                  : table === 'social_messages'
                    ? [{ body: 'Hej', conversation_id: 'conv-1', created_at: '2026-08-26T08:00:00Z', id: 'm1', sender_id: userB, type: 'text' }]
                    : table === 'social_blocks'
                      ? []
                      : [],
          error: null,
        })
        return result
      }),
      rpc,
    }
    const api = createSocialApi({ client })
    const profile = await api.upsertPublicProfile({ username: 'Hassan', displayName: 'Hassan' })
    expect(profile.username).toBe('hassan')
    expect(rpc).toHaveBeenCalledWith('social_upsert_public_profile', expect.objectContaining({
      p_username: 'hassan',
      p_display_name: 'Hassan',
    }))
    const request = await api.sendFriendRequest(userB)
    expect(request.status).toBe('pending')
    await api.respondToFriendRequest('req-1', 'accept')
    await api.respondToFriendRequest('req-1', 'decline')
    await api.removeFriend(userB)
    await api.blockUser(userB)
    const sent = await api.sendText('conv-1', 'Tränar vi?')
    expect(sent.body).toBe('Tränar vi?')
    await api.markRead('conv-1')
    expect(rpc).toHaveBeenCalledWith('social_respond_friend_request', expect.objectContaining({ p_status: 'accepted' }))
    expect(rpc).toHaveBeenCalledWith('social_mark_read', { p_conversation_id: 'conv-1' })
  })

  it('never logs chat body through safeLogger paths in socialApi', async () => {
    const { safeLogger } = await import('../../services/safeLogger.js')
    const spy = vi.spyOn(safeLogger, 'info')
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: userA } }, error: null }) },
      from: vi.fn(() => {
        const result = {
          insert: vi.fn(() => result),
          select: vi.fn(() => result),
          single: vi.fn(async () => ({
            data: { conversation_id: 'conv-1', created_at: '2026-08-26T08:00:00Z', id: 'm1', sender_id: userA, type: 'text' },
            error: null,
          })),
        }
        return result
      }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    }
    const api = createSocialApi({ client })
    await api.sendText('conv-1', 'hemlig chatttext')
    const payloads = spy.mock.calls.map((call) => JSON.stringify(call))
    expect(payloads.join('\n')).not.toContain('hemlig chatttext')
    spy.mockRestore()
  })

  it('subscribes and cleans up realtime without polling', () => {
    const channelObj = { on: vi.fn(function on() { return this }), subscribe: vi.fn() }
    const client = { channel: vi.fn(() => channelObj), removeChannel: vi.fn() }
    const stop = subscribeConversationMessages({
      client,
      conversationId: 'conv-1',
      enabled: true,
      isAuthenticated: true,
      onInsert: vi.fn(),
      supabaseConfigured: true,
    })
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(channelObj.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({
      event: 'INSERT',
      table: 'social_messages',
    }), expect.any(Function))
    stop()
    expect(client.removeChannel).toHaveBeenCalledWith(channelObj)

    const inbox = { on: vi.fn(function on() { return this }), subscribe: vi.fn() }
    const inboxClient = { channel: vi.fn(() => inbox), removeChannel: vi.fn() }
    const stopInbox = subscribeInbox({
      client: inboxClient,
      enabled: true,
      isAuthenticated: true,
      onChange: vi.fn(),
      supabaseConfigured: true,
      userId: userA,
    })
    stopInbox()
    expect(inboxClient.removeChannel).toHaveBeenCalledWith(inbox)
  })
})

describe('AI Coach isolation', () => {
  it('does not import social chat modules into AI Coach services', () => {
    const coach = readFileSync(new URL('../../services/aiCoachV2Service.js', import.meta.url), 'utf8')
    const reply = readFileSync(new URL('../../lib/coachReply.js', import.meta.url), 'utf8')
    expect(coach).not.toContain('features/social')
    expect(coach).not.toContain('social_messages')
    expect(reply).not.toContain('features/social')
    expect(reply).not.toContain('social_messages')
  })
})
