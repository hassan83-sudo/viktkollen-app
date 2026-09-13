import { ensurePlacePushSubscription } from '../../features/place/placePushService.js'
import { supabase } from '../supabaseClient.js'
import { normalizeReminderState } from './reminderModel.js'
import { getNextReminderAt } from './reminderScheduler.js'

function unsupported(message) {
  return { data: null, error: new Error(message) }
}

function toRow(userId, reminder) {
  const nextRunAt = getNextReminderAt(reminder)

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
    snoozed_until: reminder.snoozedUntil || null,
    start_date: reminder.startDate || null,
    timezone: reminder.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm',
    title: reminder.title || 'Påminnelse från Viktkollen',
    updated_at: new Date().toISOString(),
    user_id: userId,
  }
}

export async function enableReminderBackgroundPush() {
  return ensurePlacePushSubscription()
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
    .select('reminder_id')

  if (existingError) return { data: null, error: existingError }

  const staleIds = (existing || [])
    .map((row) => row.reminder_id)
    .filter((id) => id && !reminderIds.includes(id))

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('reminder_push_schedules')
      .delete()
      .in('reminder_id', staleIds)

    if (deleteError) return { data: null, error: deleteError }
  }

  if (!state.reminders.length) return { data: { synced: 0 }, error: null }

  const rows = state.reminders.map((reminder) => toRow(userId, reminder))
  const { error: upsertError } = await supabase
    .from('reminder_push_schedules')
    .upsert(rows, { onConflict: 'user_id,reminder_id' })

  if (upsertError) return { data: null, error: upsertError }
  return { data: { synced: rows.length }, error: null }
}
