export function normalizeSpacing(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalizeAiCoachText(value) {
  const text = normalizeSpacing(value)
    .toLocaleLowerCase('sv-SE')
    .normalize('NFC')
  const searchable = text
    .replace(/[!?.,;:()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    compact: searchable.replace(/[^a-zåäö0-9]/gi, ''),
    plain: stripDiacritics(searchable),
    searchable,
    text,
  }
}

export function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase))
}

export function addUnique(items, item) {
  if (!items.includes(item)) {
    items.push(item)
  }
}

export function hasAnyTerm(normalized, terms, plainTerms = terms) {
  return includesAny(normalized.searchable, terms) ||
    includesAny(normalized.plain, plainTerms)
}

export function hasUnsafeOutput(value) {
  return /\b(?:nan|undefined|null)\b/i.test(String(value || ''))
}
