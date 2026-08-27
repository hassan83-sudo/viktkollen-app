export const supportedLanguages = [
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr', complete: true },
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', complete: true },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', direction: 'ltr', complete: true },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', direction: 'ltr', complete: true },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', direction: 'ltr', complete: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', complete: true },
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文', direction: 'ltr', complete: true },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', direction: 'ltr', complete: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', complete: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', complete: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', complete: true },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', complete: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', complete: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', complete: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', complete: true },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr', complete: true },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr', complete: true },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', direction: 'ltr', complete: false },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', direction: 'ltr', complete: false },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', direction: 'ltr', complete: false },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', complete: false },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', complete: false },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr', complete: false },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl', complete: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr', complete: false },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', complete: false },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', complete: false },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', direction: 'ltr', complete: false },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr', complete: false },
]

export const defaultLanguageCode = 'sv'

export const supportedLanguageCodes = supportedLanguages.map((language) => language.code)

export function getLanguageDefinition(code) {
  return supportedLanguages.find((language) => language.code === code) || supportedLanguages[0]
}

export function normalizeLanguageCode(input) {
  const value = String(input || '').trim()
  if (!value) return defaultLanguageCode

  const lowered = value.toLowerCase()
  const directMatch = supportedLanguages.find((language) => language.code.toLowerCase() === lowered)
  if (directMatch) return directMatch.code

  if (lowered.startsWith('sv')) return 'sv'
  if (lowered.startsWith('en')) return 'en'
  if (lowered.startsWith('da')) return 'da'
  if (lowered === 'nb' || lowered === 'nn' || lowered.startsWith('nb-') || lowered.startsWith('nn-') || lowered.startsWith('no')) return 'no'
  if (lowered.startsWith('fi')) return 'fi'
  if (lowered.startsWith('ar')) return 'ar'
  if (lowered === 'zh' || lowered.startsWith('zh-cn') || lowered.startsWith('zh-sg')) return 'zh-CN'
  if (lowered.startsWith('zh-tw') || lowered.startsWith('zh-hk') || lowered.startsWith('zh-mo')) return 'zh-TW'
  if (lowered.startsWith('ja')) return 'ja'
  if (lowered.startsWith('ko')) return 'ko'
  if (lowered.startsWith('de')) return 'de'
  if (lowered.startsWith('fr')) return 'fr'
  if (lowered.startsWith('es')) return 'es'
  if (lowered.startsWith('it')) return 'it'
  if (lowered.startsWith('pt')) return 'pt'
  if (lowered.startsWith('nl')) return 'nl'
  if (lowered.startsWith('pl')) return 'pl'
  if (lowered.startsWith('cs')) return 'cs'
  if (lowered.startsWith('hu')) return 'hu'
  if (lowered.startsWith('ro')) return 'ro'
  if (lowered.startsWith('el')) return 'el'
  if (lowered.startsWith('tr')) return 'tr'
  if (lowered.startsWith('uk')) return 'uk'
  if (lowered.startsWith('he')) return 'he'
  if (lowered.startsWith('hi')) return 'hi'
  if (lowered.startsWith('id')) return 'id'
  if (lowered.startsWith('vi')) return 'vi'
  if (lowered.startsWith('th')) return 'th'
  if (lowered.startsWith('ms')) return 'ms'

  return defaultLanguageCode
}
