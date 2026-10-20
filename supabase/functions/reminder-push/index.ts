import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function ensureVapidKeys(service: ReturnType<typeof createClient>) {
  const { data: existing, error } = await service.from('place_push_vapid_config').select('public_key,private_key').eq('id', 1).maybeSingle()
  if (error) throw error
  if (existing?.public_key && existing?.private_key) return existing
  const generated = webpush.generateVAPIDKeys()
  const { error: upsertError } = await service.from('place_push_vapid_config').upsert({ id: 1, public_key: generated.publicKey, private_key: generated.privateKey, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (upsertError) throw upsertError
  return { public_key: generated.publicKey, private_key: generated.privateKey }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function actionToken(secret: string, scheduleId: string, reminderId: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${scheduleId}:${reminderId}`))
  return bytesToHex(new Uint8Array(signature))
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function sendPush(service: ReturnType<typeof createClient>, supabaseUrl: string, userId: string, title: string, reminderId: string, scheduleId: string) {
  const vapid = await ensureVapidKeys(service)
  webpush.setVapidDetails('https://viktkollen-app.vercel.app', vapid.public_key, vapid.private_key)
  const token = await actionToken(vapid.private_key, scheduleId, reminderId)
  const { data: subscriptions, error } = await service.from('place_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id', userId)
  if (error) throw error
  let sent = 0
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, JSON.stringify({
        title,
        body: `Dags för ${title}.`,
        data: {
          type: 'reminder',
          reminderId,
          scheduleId,
          actionToken: token,
          actionUrl: `${supabaseUrl}/functions/v1/reminder-push`,
          url: '/#app-section-notices',
        },
      }), { TTL: 3600 })
      sent += 1
    } catch (pushError) {
      const statusCode = Number(pushError?.statusCode || pushError?.status || 0)
      if (statusCode === 404 || statusCode === 410) await service.from('place_push_subscriptions').delete().eq('id', subscription.id)
      else console.error('Reminder push failed:', pushError)
    }
  }
  return sent
}

function nextRun(row: any, after: Date) {
  if (row.schedule_type === 'once') return null
  if (row.schedule_type === 'interval') return new Date(after.getTime() + Math.max(60, Number(row.interval_minutes) || 60) * 60000).toISOString()
  const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for (let offset = 1; offset <= 370; offset += 1) {
    const local = new Date(after.toLocaleString('en-US', { timeZone: row.timezone || 'Europe/Stockholm' }))
    local.setDate(local.getDate() + offset)
    const weekday = weekdayNames[local.getDay()]
    const allowed = row.schedule_type === 'daily'
      || (row.schedule_type === 'weekdays' && !['saturday','sunday'].includes(weekday))
      || (row.schedule_type === 'weekends' && ['saturday','sunday'].includes(weekday))
      || (['weekly','selected_weekdays'].includes(row.schedule_type) && (row.days_of_week || []).includes(weekday))
    if (!allowed) continue
    const dateText = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`
    const timeText = String(row.reminder_time || '09:00:00').slice(0,5)
    const probe = new Date(`${dateText}T${timeText}:00`)
    const utcProbe = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }))
    const tzProbe = new Date(probe.toLocaleString('en-US', { timeZone: row.timezone || 'Europe/Stockholm' }))
    return new Date(probe.getTime() + (utcProbe.getTime() - tzProbe.getTime())).toISOString()
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server configuration missing' }, 500)
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))
  if (body?.action === 'snooze' || body?.action === 'done') {
    const scheduleId = String(body.scheduleId || '')
    const reminderId = String(body.reminderId || '')
    const suppliedToken = String(body.actionToken || '')
    if (!scheduleId || !reminderId || !suppliedToken) return json({ error: 'Invalid reminder action' }, 400)

    const vapid = await ensureVapidKeys(service)
    const expectedToken = await actionToken(vapid.private_key, scheduleId, reminderId)
    if (!safeEqual(suppliedToken, expectedToken)) return json({ error: 'Unauthorized' }, 401)

    const { data: schedule, error: scheduleError } = await service.from('reminder_push_schedules').select('id,reminder_id').eq('id', scheduleId).eq('reminder_id', reminderId).maybeSingle()
    if (scheduleError) return json({ error: scheduleError.message }, 500)
    if (!schedule) return json({ error: 'Reminder not found' }, 404)

    if (body.action === 'snooze') {
      const minutes = Math.min(20, Math.max(1, Math.round(Number(body.minutes) || 5)))
      const snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString()
      const { error } = await service.from('reminder_push_schedules').update({
        enabled: true,
        paused: false,
        archived: false,
        snoozed_until: snoozedUntil,
        next_run_at: snoozedUntil,
        updated_at: new Date().toISOString(),
      }).eq('id', scheduleId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, action: 'snooze', minutes, nextRunAt: snoozedUntil })
    }

    const { error } = await service.from('reminder_push_schedules').update({
      snoozed_until: null,
      updated_at: new Date().toISOString(),
    }).eq('id', scheduleId)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, action: 'done' })
  }

  const cronToken = req.headers.get('x-cron-token')
  const { data: config } = await service.from('reminder_push_config').select('cron_token').eq('id', 1).single()
  if (!cronToken || !config?.cron_token || cronToken !== config.cron_token) return json({ error: 'Unauthorized' }, 401)

  const now = new Date()
  const { data: due, error } = await service.from('reminder_push_schedules').select('*').eq('enabled', true).eq('paused', false).eq('archived', false).lte('next_run_at', now.toISOString()).order('next_run_at').limit(100)
  if (error) return json({ error: error.message }, 500)
  let sent = 0
  for (const row of due || []) {
    if (row.snoozed_until && new Date(row.snoozed_until) > now) {
      await service.from('reminder_push_schedules').update({ next_run_at: row.snoozed_until, updated_at: now.toISOString() }).eq('id', row.id)
      continue
    }
    sent += await sendPush(service, supabaseUrl, row.user_id, row.title, row.reminder_id, row.id)
    await service.from('reminder_push_schedules').update({
      last_sent_at: now.toISOString(),
      snoozed_until: null,
      next_run_at: nextRun(row, now),
      enabled: row.schedule_type === 'once' ? false : row.enabled,
      updated_at: now.toISOString(),
    }).eq('id', row.id)
  }
  return json({ checked: due?.length || 0, sent })
})
