export const socialMessageDeletionPolicy = Object.freeze({
  choice: 'A_delete',
  label: 'delete',
  summary:
    'When user A deletes their account, every DM thread A participated in is deleted entirely (messages, members, dm_pairs, conversation). Surviving user B loses that shared thread. No anonymized sender rows remain.',
})

export const futureSocialDeletionTables = Object.freeze([
  { area: 'social', name: 'social_messages' },
  { area: 'social', name: 'social_conversation_members' },
  { area: 'social', name: 'social_dm_pairs' },
  { area: 'social', name: 'social_conversations' },
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
