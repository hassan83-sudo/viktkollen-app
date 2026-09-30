import { normalizeLanguageCode } from '../../i18n/languages.js'

const chrome = {
  sv: {
    close: 'Stäng',
    empty: 'Ställ en fråga om hur Viktkollen fungerar.',
    error: 'AI-Hjälpen kunde inte svara just nu.',
    modelLimited: 'Den avancerade förklaringen är tillfälligt begränsad. Tydliga frågor om appens funktioner kan fortfarande besvaras.',
    open: 'Öppna AI-Hjälp',
    opened: 'Avsnittet är öppnat.',
    outOfScope: 'Jag hjälper bara till med hur Viktkollen fungerar.',
    placeholder: 'Fråga om Viktkollen',
    send: 'Skicka',
    signIn: 'Logga in för att använda AI-Hjälp.',
    title: 'AI-Hjälp',
    unanswered: 'Jag kan inte svara på det ännu. Frågan är registrerad.',
  },
  en: {
    close: 'Close',
    empty: 'Ask how Viktkollen works.',
    error: 'AI Help could not answer right now.',
    modelLimited: 'The longer explanation is temporarily limited. Clear questions about app features can still be answered.',
    open: 'Open AI Help',
    opened: 'The section is open.',
    outOfScope: 'I can only help with how Viktkollen works.',
    placeholder: 'Ask about Viktkollen',
    send: 'Send',
    signIn: 'Sign in to use AI Help.',
    title: 'AI Help',
    unanswered: 'I cannot answer that yet. The question has been recorded.',
  },
}

export function helpChrome(languageCode) {
  return normalizeLanguageCode(languageCode) === 'sv' ? chrome.sv : chrome.en
}
