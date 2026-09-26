import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import i18n from '../i18n/index.js'

// A11Y-8Z2: Place texts (8T/8Y B10) and the Mer folder error titles (8T B-N4)
// follow the app language. The source checks are scoped to the exact strings
// that were hardcoded in these files, not a global text search.

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

afterAll(async () => {
  await i18n.changeLanguage('sv')
})

describe('Place texts follow the language (B10)', () => {
  const keys = {
    'checkin.choices.ok': ['Jag är okej', 'I am okay'],
    'checkin.sent': ['✓ Jag är okej skickat till familjen.', '✓ I am okay sent to the family.'],
    'notice.close': ['Stäng notis', 'Close notice'],
    'push.inactive': ['Inte aktiverad ännu', 'Not activated yet'],
    'push.label': ['Pushnotiser:', 'Push notifications:'],
    'safePlaceNotifications.arrival': ['Notis när personen kommer hit', 'Notify when the person arrives here'],
    'safetyAlert.reasons.threatened': ['Jag känner mig hotad', 'I feel threatened'],
    'safetyAlert.sent': ['Trygghetslarm skickat till familjen.', 'Safety alert sent to the family.'],
    'safetyAlert.title': ['Trygghetslarm', 'Safety alert'],
    'sharingStatus.active': ['Platsdelning aktiv', 'Location sharing active'],
    'voiceCall.aria': ['Prata med Ada', 'Talk to Ada'],
  }

  it('Swedish and English resolve for every moved text', async () => {
    for (const [language, index] of [['sv', 0], ['en', 1]]) {
      await i18n.changeLanguage(language)
      for (const [key, values] of Object.entries(keys)) {
        expect(i18n.t(`place:${key}`, { label: i18n.t('place:checkin.choices.ok') ? `✓ ${i18n.t('place:checkin.choices.ok')}` : '', name: 'Ada' }), `${language} ${key}`).toBe(values[index])
      }
      for (const reason of ['threatened', 'lost', 'injured', 'unsafe', 'pickup', 'other']) {
        expect(i18n.exists(`place:safetyAlert.reasons.${reason}`), `${language} ${reason}`).toBe(true)
      }
      for (const status of ['active', 'inactive', 'denied', 'unsupported', 'unknown']) {
        expect(i18n.exists(`place:push.${status}`), `${language} push ${status}`).toBe(true)
      }
    }
  })

  it('the B10 strings are no longer hardcoded in PlaceSection and PlaceVoiceCallPanel', () => {
    const place = source('src/components/sections/PlaceSection.jsx')
    for (const text of [
      'Jag känner mig hotad', 'Jag har gått vilse', 'Jag har skadat mig', 'Jag känner mig otrygg', 'Jag behöver bli hämtad', 'Annat – jag behöver hjälp',
      'Jag är okej', 'Jag är hemma', 'Jag är på väg', 'Inte aktiverad ännu', 'Stäng notis', 'Platsdelning aktiv',
      'Notis när personen kommer hit', 'Notis när personen lämnar platsen', 'Aktiv i appen', 'Pushnotiser:',
      'Skicka snabbt ett larm', 'Trygghetslarm skickat', 'Vad har hänt?', 'Skickar trygghetslarm', 'Skicka en snabb check-in', 'skickat till familjen',
    ]) {
      expect(place, text).not.toContain(text)
    }
    expect(source('src/components/place/PlaceVoiceCallPanel.jsx')).not.toContain('Prata med ${')
  })
})

describe('Mer folder error titles (B-N4)', () => {
  const folders = ['nutritionError', 'coachError', 'wellbeingError', 'economyError', 'signLanguageError', 'animalWorldError', 'pregnancyFirstYearError', 'cloudError', 'goalsProgressError', 'archiveError']

  it('every title MoreSection uses exists in the settings namespace in Swedish and English', async () => {
    const more = source('src/components/sections/MoreSection.jsx')
    const used = [...more.matchAll(/t\('(\w+Error)'/g)].map((match) => match[1])
    expect([...new Set(used)].sort()).toEqual([...folders].sort())
    // No Swedish fallback: the title comes from the language resources.
    expect(more).not.toMatch(/t\('\w+Error', \{ defaultValue/)
    for (const language of ['sv', 'en']) {
      await i18n.changeLanguage(language)
      for (const key of folders) expect(i18n.exists(`settings:${key}`), `${language} ${key}`).toBe(true)
    }
    await i18n.changeLanguage('en')
    expect(i18n.t('settings:nutritionError')).toBe('Food could not be shown')
    expect(i18n.t('settings:pregnancyFirstYearError')).toBe('Pregnancy and the first year could not be shown')
    await i18n.changeLanguage('sv')
    expect(i18n.t('settings:nutritionError')).toBe('Mat kunde inte visas')
  })
})
