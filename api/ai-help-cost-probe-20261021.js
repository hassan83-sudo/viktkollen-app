import { createCostStoreFromEnv } from './_shared/aiHelp/supabaseCostStore.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (req.method !== 'GET') return res.status(405).end()
  // Temporary read-only probe. Returns no credentials, data, or diagnostics.
  const result = await createCostStoreFromEnv().listOutstanding({ olderThanSeconds: 2147483647 })
  return res.status(result.ok === true ? 204 : 503).end()
}
