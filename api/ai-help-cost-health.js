import { createCostStoreFromEnv } from './_shared/aiHelp/supabaseCostStore.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  const expectedToken = String(process.env.AI_HELP_COST_HEALTH_TOKEN || '')
  const suppliedToken = String(req.headers['x-ai-help-cost-health-token'] || '')
  if (!expectedToken || suppliedToken.length !== expectedToken.length || suppliedToken !== expectedToken) {
    return res.status(404).json({ ok: false, error: 'not_found' })
  }

  const store = createCostStoreFromEnv()
  try {
    const result = await store.listOutstanding({ olderThanSeconds: 2147483647 })
    if (!result?.ok) {
      return res.status(503).json({ ok: false, error: 'cost_store_unavailable' })
    }
    return res.status(200).json({ ok: true, check: 'cost_store_rpc', reachable: true })
  } catch {
    return res.status(503).json({ ok: false, error: 'cost_store_unavailable' })
  }
}
