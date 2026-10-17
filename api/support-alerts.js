import { createSupabaseAdminClient } from './_shared/supabaseServer.js'

// Scheduled server-side email alerts. No browser session, ticket text or user data is sent.
// Configure CRON_SECRET, RESEND_API_KEY, SUPPORT_ALERT_TO and SUPPORT_ALERT_FROM
// on the deployment before enabling a scheduler.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ ok: false })
  }
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
    return response.status(401).json({ ok: false })
  }
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.SUPPORT_ALERT_TO
  const from = process.env.SUPPORT_ALERT_FROM
  if (!apiKey || !to || !from) return response.status(503).json({ ok: false, code: 'ALERT_NOT_CONFIGURED' })
  const client = createSupabaseAdminClient()
  if (!client) return response.status(503).json({ ok: false, code: 'DATABASE_UNAVAILABLE' })
  const { data: claims, error } = await client.schema('support').rpc('claim_pending_alerts', { p_limit: 20 })
  if (error) return response.status(503).json({ ok: false, code: 'CLAIM_FAILED' })
  let sent = 0
  let failed = 0
  for (const claim of claims || []) {
    try {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [to],
          subject: 'Viktkollen: nytt kundtjänstärende',
          text: 'Ett betalande kundtjänstärende väntar i adminpanelen. Logga in i Viktkollen för att hantera ärendet.',
          // Provider-side idempotency reduces duplicate sends on transient failures.
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!result.ok) throw new Error('email_delivery_failed')
      const { error: updateError } = await client.schema('support').from('alert_deliveries')
        .update({ state: 'sent', sent_at: new Date().toISOString() })
        .eq('ticket_id', claim.ticket_id).eq('ticket_version', claim.ticket_version).eq('state', 'sending')
      if (updateError) throw updateError
      sent++
    } catch {
      failed++
      await client.schema('support').from('alert_deliveries')
        .update({ state: 'failed' })
        .eq('ticket_id', claim.ticket_id).eq('ticket_version', claim.ticket_version).eq('state', 'sending')
    }
  }
  return response.status(failed ? 503 : 200).json({ ok: failed === 0, sent, failed })
}
