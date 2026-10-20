import { ensurePlacePushSubscription } from '../../features/place/placePushService.js'
import { supabase } from '../supabaseClient.js'
import { normalizeReminderState } from './reminderModel.js'
import { getNextReminderAt } from './reminderScheduler.js'

function unsupported(message) {
  return { data: null, error: new Error(message) }
}

const EXISTING_ROW_FIELDS = 'reminder_id,snoozed_until,updated_at,next_run_at,last_sent_at,schedule_type,interval_minutes,reminder_time,start_date,days_of_week'

function futureIso(value, now) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now) return ''
  return parsed.toISOString()
}

function localDateText(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// En intervalltid som redan har passerat flyttas fram med hela intervall, så att rytmen
// och det valda klockslaget behålls och servern inte skickar en gammal påminnelse direkt.
function futureIntervalAt(candidate, reminder, now) {
  const at = new Date(candidate).getTime()
  if (!Number.isFinite(at)) return null
  if (at > now) return new Date(at).toISOString()
  const intervalMs = Math.max(60, Number(reminder.intervalMinutes) || 60) * 60000
  const next = new Date(at + (Math.floor((now - at) / intervalMs) + 1) * intervalMs)
  if (reminder.endDate && localDateText(next) > reminder.endDate) return null
  return next.toISOString()
}

function sameSchedule(existingRow, reminder) {
  const days = (value) => (Array.isArray(value) ? [...value].sort().join(',') : '')
  return existingRow.schedule_type === reminder.scheduleType
    && (Number(existingRow.interval_minutes) || 0) === (Number(reminder.intervalMinutes) || 0)
    && String(existingRow.reminder_time || '').slice(0, 5) === String(reminder.time || '09:00').slice(0, 5)
    && (existingRow.start_date || null) === (reminder.startDate || null)
    && days(existingRow.days_of_week) === days(reminder.daysOfWeek)
}

// När servern redan har skickat en intervallpåminnelse och räknat fram nästa körning gäller
// serverns tid. Appens egen rytm kan ligga några sekunder fel och får varken dra tillbaka
// tiden (dubbel push) eller hoppa ett helt intervall framåt (utebliven push).
// Gäller bara intervall: för dagliga och veckovisa påminnelser räknar appen alltid nästa
// tillfälle efter nu, medan servern kan ha hoppat över dagens tillfälle efter en sen push.
function keepServerProgress(nextRunAt, existingRow, reminder, now) {
  if (reminder.scheduleType !== 'interval') return nextRunAt
  const serverNext = futureIso(existingRow?.next_run_at, now)
  if (!nextRunAt || !serverNext || !existingRow?.last_sent_at || !sameSchedule(existingRow, reminder)) return nextRunAt
  return serverNext
}

// En servertid som just har inträffat men som schemajobbet (varje minut) ännu inte har
// hunnit skicka behålls, så att synken inte flyttar fram en påminnelse som ska skickas nu.
// Bara högst 2 minuter tillbaka och med oförändrat schema, så gamla tider kommer aldrig tillbaka.
const PENDING_SERVER_RUN_MS = 2 * 60000

function pendingServerRun(existingRow, reminder, now) {
  if (!reminder.enabled || reminder.archivedAt || reminder.pausedAt || reminder.needsReview) return ''
  if (!existingRow?.next_run_at || !sameSchedule(existingRow, reminder)) return ''
  const at = new Date(existingRow.next_run_at).getTime()
  if (!Number.isFinite(at) || at > now || at < now - PENDING_SERVER_RUN_MS) return ''
  return new Date(at).toISOString()
}

export function buildReminderPushRow(userId, reminder, existingRow, { now = Date.now() } = {}) {
  const serverSnooze = futureIso(existingRow?.snoozed_until, now)
  const localSnooze = futureIso(reminder.snoozedUntil, now)
  const snoozedUntil = localSnooze || serverSnooze || null
  let nextRunAt = snoozedUntil || pendingServerRun(existingRow, reminder, now)
  if (!nextRunAt) {
    const scheduled = getNextReminderAt(reminder, { now })
    nextRunAt = scheduled && reminder.scheduleType === 'interval' ? futureIntervalAt(scheduled, reminder, now) : scheduled
    nextRunAt = keepServerProgress(nextRunAt, existingRow, reminder, now)
  }

  return {
    archived: Boolean(reminder.archivedAt),
    body: reminder.description || 'Du har en påminnelse i Viktkollen.',
    days_of_week: Array.isArray(reminder.daysOfWeek) ? reminder.daysOfWeek : [],
    enabled: reminder.enabled !== false,
    interval_minutes: Number(reminder.intervalMinutes) || 0,
    next_run_at: nextRunAt || null,
    paused: Boolean(reminder.pausedAt),
    reminder_id: reminder.id,
    reminder_time: reminder.time || '09:00',
    schedule_type: reminder.scheduleType,
    snoozed_until: snoozedUntil,
    start_date: reminder.startDate || null,
    timezone: reminder.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm',
    title: reminder.title || 'Påminnelse från Viktkollen',
    updated_at: new Date(now).toISOString(),
    user_id: userId,
  }
}

async function currentUserId() {
  if (!supabase) return { userId: '', error: new Error('Bakgrundsnotiser kräver att Supabase är anslutet.') }
  const { data, error } = await supabase.auth.getSession()
  if (error) return { userId: '', error }
  const userId = data?.session?.user?.id || ''
  if (!userId) return { userId: '', error: new Error('Du måste vara inloggad för bakgrundsnotiser.') }
  return { userId, error: null }
}

export async function enableReminderBackgroundPush() {
  return ensurePlacePushSubscription()
}

export async function upsertKitchenTimerPushSchedule({ appliance, endsAt, timerId }) {
  const { userId, error: userError } = await currentUserId()
  if (userError) return { data: null, error: userError }

  const endDate = new Date(endsAt)
  if (Number.isNaN(endDate.getTime())) return unsupported('Timertiden kunde inte läsas.')

  const reminderId = `kitchen-timer-${timerId}`
  const localTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
  const localDate = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  const row = {
    archived: false,
    body: `Dags att kontrollera ${String(appliance || 'köket').toLowerCase()}.`,
    days_of_week: [],
    enabled: true,
    interval_minutes: 0,
    next_run_at: endDate.toISOString(),
    paused: false,
    reminder_id: reminderId,
    reminder_time: localTime,
    schedule_type: 'once',
    snoozed_until: null,
    start_date: localDate,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm',
    title: `${appliance || 'Kök'} – timer klar`,
    updated_at: new Date().toISOString(),
    user_id: userId,
  }

  const { error } = await supabase
    .from('reminder_push_schedules')
    .upsert(row, { onConflict: 'user_id,reminder_id' })

  return error ? { data: null, error } : { data: { reminderId }, error: null }
}

export async function removeKitchenTimerPushSchedule(timerId) {
  const { userId, error: userError } = await currentUserId()
  if (userError) return { data: null, error: userError }

  const { error } = await supabase
    .from('reminder_push_schedules')
    .delete()
    .eq('user_id', userId)
    .eq('reminder_id', `kitchen-timer-${timerId}`)

  return error ? { data: null, error } : { data: { removed: true }, error: null }
}

export async function syncReminderPushSchedules(reminderState) {
  if (!supabase) return unsupported('Bakgrundsnotiser kräver att Supabase är anslutet.')

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return { data: null, error: sessionError }
  const userId = sessionData?.session?.user?.id
  if (!userId) return unsupported('Du måste vara inloggad för bakgrundsnotiser.')

  const state = normalizeReminderState(reminderState)
  const reminderIds = state.reminders.map((reminder) => reminder.id)

  const { data: existing, error: existingError } = await supabase
    .from('reminder_push_schedules')
    .select(EXISTING_ROW_FIELDS)

  if (existingError) return { data: null, error: existingError }

  const existingByReminderId = new Map((existing || []).map((row) => [row.reminder_id, row]))
  const staleIds = (existing || [])
    .map((row) => row.reminder_id)
    .filter((id) => id && !id.startsWith('kitchen-timer-') && !reminderIds.includes(id))

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('reminder_push_schedules')
      .delete()
      .in('reminder_id', staleIds)

    if (deleteError) return { data: null, error: deleteError }
  }

  if (!state.reminders.length) return { data: { synced: 0 }, error: null }

  const now = Date.now()
  const rows = state.reminders.map((reminder) => buildReminderPushRow(userId, reminder, existingByReminderId.get(reminder.id), { now }))
  const { error: upsertError } = await supabase
    .from('reminder_push_schedules')
    .upsert(rows, { onConflict: 'user_id,reminder_id' })

  if (upsertError) return { data: null, error: upsertError }
  return { data: { synced: rows.length }, error: null }
}
