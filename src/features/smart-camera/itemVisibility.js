export function formatUnseenItemMessage(itemLabel) {
  const label = String(itemLabel || '').trim() || 'det föremålet'
  return `Jag kan inte se ${label.toLowerCase()}. Kontrollera att du har ${label.toLowerCase()} med dig.`
}

export function compareChecklistToVisibleItems(items = [], visibleIds = []) {
  const visible = new Set((visibleIds || []).map(String))
  const seen = []
  const check = []

  items.forEach((item) => {
    const entry = {
      id: item.id,
      label: item.label,
    }
    if (visible.has(String(item.id)) || item.done) {
      seen.push(entry)
    } else {
      check.push({
        ...entry,
        message: formatUnseenItemMessage(item.label),
      })
    }
  })

  return {
    check,
    seen,
    unseenIsNotMissing: true,
  }
}

export function assertNoMissingClaim(message) {
  const text = String(message || '').toLowerCase()
  return !text.includes('du har glömt') && !text.includes('saknas definitivt')
}
