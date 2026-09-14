import { ensurePlacePushSubscription } from '../../features/place/placePushService.js'
import { supabase } from '../supabaseClient.js'
import { normalizeReminderState } from './reminderModel.js'
import { getNextReminderAt } from './reminderScheduler.js'

function unsupported(message) {
  return { data: null, error: new Error(message) }
}

function activeServerSnooze(existingRow) {
  const value = existingRow?.snoozed_until
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return ''
  return parsed.toISOString()
}

function toRow(userId, reminder, existingRow) {
  const serverSnooze = activeServerSnooze(existingRow)
  const localSnooze = reminder.snoozedUntil || ''
  const snoozedUntil = localSnooze || serverSnooze || null
  const nextRunAt = snoozedUntil || getNextReminderAt(reminder)

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
    updated_at: new Date().toISOString(),
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
    .select('reminder_id,snoozed_until,updated_at')

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

  const rows = state.reminders.map((reminder) => toRow(userId, reminder, existingByReminderId.get(reminder.id)))
  const { error: upsertError } = await supabase
    .from('reminder_push_schedules')
    .upsert(rows, { onConflict: 'user_id,reminder_id' })

  if (upsertError) return { data: null, error: upsertError }
  return { data: { synced: rows.length }, error: null }
}
