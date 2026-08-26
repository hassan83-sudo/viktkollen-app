export async function loadSocialSnapshot(api) {
  const [friends, requests, conversations, blocks] = await Promise.all([
    api.listFriends(),
    api.listFriendRequests(),
    api.listConversations(),
    api.listBlocks(),
  ])

  return {
    blocks,
    conversations,
    friends,
    requests,
  }
}

export { shouldStartSocialSubscriptions } from '../model/socialPolicy.js'
