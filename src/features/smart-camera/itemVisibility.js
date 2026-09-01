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

export function formatUncertainItemMessage(itemLabel) {
  const label = String(itemLabel || '').trim() || 'det föremålet'
  return `Jag är inte säker på om jag ser ${label.toLowerCase()}. Kontrollera själv om du har ${label.toLowerCase()} med dig.`
}

/**
 * Merges a checklist with a per-item AI status map (identified / uncertain
 * / not_confirmed), plus any items the user marked as shown by hand. This
 * is the adapter seam a remote vision result feeds through - see
 * forgottenCheckGuide.js's summarizeForgottenCheckResult, which calls this
 * when an AI result is available and falls back to
 * compareChecklistToVisibleItems (manual-only, two-bucket) when it is not.
 *
 * A status missing from statusesById, or any value other than the three
 * known statuses, is always treated as not_confirmed - never as
 * identified. Being manually marked as shown (visibleIds, or item.done)
 * always counts as identified regardless of what the AI said, so the
 * existing manual fallback keeps working exactly as before even when an
 * AI result is also present.
 *
 * @param {Array<{done: boolean, id: string, label: string}>} items
 * @param {object} [options]
 * @param {Record<string, string>} [options.statusesById] - id -> 'identified'|'uncertain'|'not_confirmed'
 * @param {string[]} [options.visibleIds] - ids the user manually marked as shown
 */
export function applyItemStatuses(items = [], { statusesById = {}, visibleIds = [] } = {}) {
  const manuallyVisible = new Set((visibleIds || []).map(String))
  const seen = []
  const uncertain = []
  const check = []

  items.forEach((item) => {
    const entry = {
      id: item.id,
      label: item.label,
    }
    const manuallyShown = manuallyVisible.has(String(item.id)) || item.done
    const aiStatus = statusesById[item.id]

    if (manuallyShown || aiStatus === 'identified') {
      seen.push(entry)
    } else if (aiStatus === 'uncertain') {
      uncertain.push({
        ...entry,
        message: formatUncertainItemMessage(item.label),
      })
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
    uncertain,
    unseenIsNotMissing: true,
  }
}
