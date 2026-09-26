export const socialMessageDeletionPolicy = Object.freeze({
  choice: 'C_retain_shared_thread',
  label: 'delete own rows',
  summary:
    'When user A deletes their account, only A\'s messages, membership, DM-pair index, location rows, friend graph, and profile are removed. User B keeps the conversation, B\'s membership, B\'s messages, and the shared conversation key.',
})

export const futureSocialDeletionTables = Object.freeze([
  { area: 'social', name: 'social_messages' },
  { area: 'social', name: 'social_conversation_members' },
  { area: 'social', name: 'social_dm_pairs' },
  { area: 'social', name: 'social_location_envelopes' },
  { area: 'social', name: 'social_locations' },
  { area: 'social', name: 'social_friend_requests' },
  { area: 'social', name: 'social_friendships' },
  { area: 'social', name: 'social_blocks' },
  { area: 'social', name: 'social_public_profiles' },
])

export const socialDataPlacement = Object.freeze({
  backup: 'Social/chat data must stay server-side. Do not add these tables to localStorage or cloud backup snapshots.',
  deletionNow: 'Account-deletion API calls social_purge_user_data(p_user_id) via service role before auth delete.',
  now: 'Do not write friend or chat rows into Viktkollen backup/sync keys.',
  policy: socialMessageDeletionPolicy,
})

export const socialPurgeRpc = 'social_purge_user_data'
