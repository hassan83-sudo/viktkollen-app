export function startRecallRound(items = [], count = 5) {
  const labels = items
    .map((item) => String(item?.label || item || '').trim())
    .filter(Boolean)
  const selected = labels.slice(0, Math.max(1, Number(count) || 5))

  return {
    hidden: true,
    items: selected,
    prompt: `Försök komma ihåg dina ${selected.length} saker innan jag visar listan.`,
  }
}

export function normalizeRecallAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\n,;]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function compareRecallAnswer(hiddenItems = [], answer = '') {
  const expected = hiddenItems.map((item) => String(item || '').trim()).filter(Boolean)
  const given = normalizeRecallAnswer(answer)
  const matched = expected.filter((item) => given.some((entry) => entry === item.toLowerCase() || item.toLowerCase().includes(entry)))
  const missed = expected.filter((item) => !matched.includes(item))
  const extra = given.filter((entry) => !expected.some((item) => item.toLowerCase() === entry || item.toLowerCase().includes(entry)))

  return {
    extra,
    matched,
    missed,
    score: `${matched.length}/${expected.length}`,
  }
}
