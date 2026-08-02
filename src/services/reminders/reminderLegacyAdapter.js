import { normalizeReminderState, normalizeReminder } from './reminderModel.js'

const legacyDefinitions = [
  {
    description: 'Registrera vikt när det passar dig.',
    enabledKey: 'weight',
    id: 'legacy-weight-reminder',
    timeKey: 'weightTime',
    title: 'Viktpåminnelse',
    type: 'weight',
  },
  {
    description: 'Lägg till en måltid om du vill följa dagen.',
    enabledKey: 'meal',
    id: 'legacy-meal-reminder',
    timeKey: 'mealTime',
    title: 'Måltidspåminnelse',
    type: 'meal_log',
  },
  {
    description: 'Ta ett glas vatten om det passar.',
    enabledKey: 'water',
    id: 'legacy-water-reminder',
    timeKey: 'waterTime',
    title: 'Vattenpåminnelse',
    type: 'custom',
  },
]

export function syncLegacyReminderSettingsToV2(state, settings = {}, options = {}) {
  const normalized = normalizeReminderState(state, options)
  const now = options.now || new Date().toISOString()
  const legacyReminders = legacyDefinitions.map((definition) => normalizeReminder({
    description: definition.description,
    enabled: settings.enabled === true && settings[definition.enabledKey] === true,
    id: definition.id,
    scheduleType: 'daily',
    source: 'legacy_settings',
    time: settings[definition.timeKey] || '09:00',
    title: definition.title,
    type: definition.type,
    updatedAt: now,
  }, { now }))

  return {
    ...normalized,
    reminders: [
      ...normalized.reminders.filter((reminder) => !legacyDefinitions.some((definition) => definition.id === reminder.id)),
      ...legacyReminders,
    ],
    updatedAt: now,
  }
}
