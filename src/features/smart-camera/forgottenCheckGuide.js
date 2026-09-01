import { applyItemStatuses, compareChecklistToVisibleItems } from './itemVisibility.js'

/**
 * "Har jag glömt något?" is a guided visual check. By default every item
 * is marked as "shown" by the user themselves while they hold it up to
 * the camera - nothing ever leaves the device. The user can additionally
 * choose, per photo, to send exactly one captured frame to a remote AI
 * check (see components/ForgottenItemsCheck.jsx and
 * services/forgottenItemsAnalysis.js for the consent-gated flow that does
 * that); the manual, fully local check keeps working unchanged as the
 * fallback whenever that is declined, unavailable, or fails.
 *
 * The guidance and privacy-notice phrases are plain data on purpose so a
 * future voice/TTS layer can read the exact same text the screen shows,
 * without the camera flow needing to be rebuilt.
 */
export const forgottenCheckIntro = 'Visa sakerna du tänker ta med dig, en i taget. Jag identifierar inte föremål automatiskt än - markera själv det du visar.'

export const forgottenCheckGuidancePhrases = Object.freeze([
  'Visa sakerna du tänker ta med dig.',
  'Rikta kameran mot bordet, väskan eller sakerna omkring dig.',
  'Flytta kameran långsamt så att jag kan kontrollera sakerna.',
  'Håll upp ett föremål i taget och markera det i listan när du visat det.',
])

export function getForgottenCheckGuidance(index = 0) {
  const total = forgottenCheckGuidancePhrases.length
  const safeIndex = ((Number(index) % total) + total) % total
  return {
    index: safeIndex,
    phrase: forgottenCheckGuidancePhrases[safeIndex],
    total,
  }
}

export function getNextForgottenCheckGuidanceIndex(index = 0) {
  return (Number(index) + 1) % forgottenCheckGuidancePhrases.length
}

export const forgottenCheckResultDisclaimer = 'Att ett föremål inte visats för kameran är inte bevis för att du har glömt det. Kontrollera själv innan du går.'

/**
 * UI copy for the optional remote AI check ("Kontrollera saker"). Kept as
 * plain data, like the guidance phrases above, so the exact same text can
 * later be read aloud by a voice layer without the camera flow or the
 * consent flow being rebuilt.
 */
export const forgottenCheckAiButtonLabel = 'Kontrollera saker'

export const forgottenCheckAiPrivacyNotice = 'För att kontrollera föremålen behöver den här bilden skickas till AI för analys. Bilden sparas inte av Viktkollen.'

export const forgottenCheckAiConsentConfirmLabel = 'Skicka bilden för analys'

export const forgottenCheckAiConsentCancelLabel = 'Avbryt'

export const forgottenCheckAiFallbackNotice = 'AI-kontrollen kunde inte genomföras just nu. Fortsätt markera själv det du visar - det fungerar som vanligt.'

/**
 * Builds the result view's data from a checklist and the ids the user has
 * marked as shown during this session. Reuses compareChecklistToVisibleItems
 * so "identifierad/synlig" vs "kan inte bekräfta" language stays identical
 * across every Smart Camera mode that compares a checklist to a camera
 * session, and so a future real vision model only has to change what feeds
 * visibleIds, not this summary logic.
 *
 * @param {Array<{done: boolean, id: string, label: string}>} items
 * @param {string[]} visibleIds - ids the user manually confirmed as shown
 * @param {Record<string, string>|null} [aiStatusesById] - id -> 'identified'|'uncertain'|'not_confirmed'
 *   from a remote AI check, or null/omitted to use the manual-only, two-bucket comparison
 */
export function summarizeForgottenCheckResult(items = [], visibleIds = [], aiStatusesById = null) {
  const comparison = aiStatusesById
    ? applyItemStatuses(items, { statusesById: aiStatusesById, visibleIds })
    : compareChecklistToVisibleItems(items, visibleIds)
  const total = items.length
  const confirmed = comparison.seen.length

  return {
    ...comparison,
    confirmedCount: confirmed,
    summary: total
      ? `Jag kan bekräfta ${confirmed} av ${total} saker.`
      : 'Listan är tom. Lägg till det du brukar ta med dig.',
    total,
  }
}
