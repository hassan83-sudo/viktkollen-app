// Val i "Testa Viktkollen". Samma ID:n kontrolleras i server-API:n och i
// databasen (test_feedback.allowed_features och tabellens check-villkor).
export const TEST_FEEDBACK_FEATURES = [
  { id: 'home', label: 'Hem' },
  { id: 'auth', label: 'Registrering och inloggning' },
  { id: 'profile', label: 'Profil och inställningar' },
  { id: 'food_scan', label: 'Matskanning' },
  { id: 'food_diary', label: 'Matdagbok och måltider' },
  { id: 'food_bank', label: 'Matbank och näringsvärden' },
  { id: 'ai_coach', label: 'AI-Coach' },
  { id: 'ai_help', label: 'AI-Hjälp och kundtjänst' },
  { id: 'ai_eye', label: 'AI-Ögat' },
  { id: 'body_scan', label: 'Kroppsskanning' },
  { id: 'wardrobe', label: 'Digital garderob' },
  { id: 'weight', label: 'Viktregistrering' },
  { id: 'progress', label: 'Framsteg och viktgraf' },
  { id: 'journey', label: 'Min resa' },
  { id: 'place', label: 'Plats' },
  { id: 'stallet', label: 'Stället' },
  { id: 'reminders', label: 'Påminnelser' },
  { id: 'navigation', label: 'Navigation och tillbaka-knappar' },
  { id: 'design', label: 'Design och textstorlek' },
  { id: 'speed', label: 'Appens hastighet' },
  { id: 'billing', label: 'Betalningar och abonnemang' },
  { id: 'other', label: 'Annat' },
]

export const TEST_FEEDBACK_CATEGORIES = [
  { id: 'not_working', label: 'Fungerar inte' },
  { id: 'crash', label: 'Appen kraschar' },
  { id: 'slow', label: 'För långsam' },
  { id: 'hard_to_understand', label: 'Svår att förstå' },
  { id: 'wrong_result', label: 'Felaktigt resultat' },
  { id: 'bad_design', label: 'Dålig design' },
  { id: 'hard_to_read', label: 'Texten är svår att läsa' },
  { id: 'button_broken', label: 'Knapp fungerar inte' },
  { id: 'missing_feature', label: 'Funktion saknas' },
  { id: 'suggestion', label: 'Förbättringsförslag' },
  { id: 'other', label: 'Annat' },
]

export const TEST_FEEDBACK_RATINGS = [
  { id: 'very_good', label: 'Fungerar mycket bra' },
  { id: 'good', label: 'Fungerar bra' },
  { id: 'partly', label: 'Fungerar delvis' },
  { id: 'poor', label: 'Fungerar dåligt' },
  { id: 'not_at_all', label: 'Fungerar inte alls' },
]

export const TEST_FEEDBACK_STATUSES = [
  { id: 'open', label: 'Öppen' },
  { id: 'in_progress', label: 'Pågår' },
  { id: 'resolved', label: 'Åtgärdad' },
  { id: 'closed', label: 'Stängd utan åtgärd' },
]

export const TEST_FEEDBACK_COMMENT_MAX = 4000
export const TEST_FEEDBACK_ADMIN_NOTE_MAX = 2000

const ids = (list) => new Set(list.map((item) => item.id))
export const FEATURE_IDS = ids(TEST_FEEDBACK_FEATURES)
export const CATEGORY_IDS = ids(TEST_FEEDBACK_CATEGORIES)
export const RATING_IDS = ids(TEST_FEEDBACK_RATINGS)
export const STATUS_IDS = ids(TEST_FEEDBACK_STATUSES)

export function labelFor(list, id) {
  return list.find((item) => item.id === id)?.label || id
}
