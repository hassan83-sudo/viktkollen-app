export function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1)
}

export function editDistanceWithinOne(left, right) {
  if (left === right) return true
  const lengthGap = left.length - right.length
  if (Math.abs(lengthGap) > 1) return false
  let edits = 0
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1
      rightIndex += 1
      continue
    }
    if (
      lengthGap === 0
      && leftIndex + 1 < left.length
      && left[leftIndex] === right[rightIndex + 1]
      && left[leftIndex + 1] === right[rightIndex]
    ) {
      edits += 1
      if (edits > 1) return false
      leftIndex += 2
      rightIndex += 2
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (left.length > right.length) leftIndex += 1
    else if (right.length > left.length) rightIndex += 1
    else {
      leftIndex += 1
      rightIndex += 1
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1
  return edits <= 1
}

export function stemToken(token) {
  const suffixes = ['arna', 'erna', 'orna', 'ande', 'ats', 'ade', 'het', 'en', 'et', 'na', 'or', 'er', 'ar']
  for (const suffix of suffixes) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) return token.slice(0, -suffix.length)
  }
  return token
}

export function matchesAlias(token, alias) {
  if (token === alias) return true
  const tokenStem = stemToken(token)
  const aliasStem = stemToken(alias)
  if (tokenStem.length >= 4 && tokenStem === aliasStem) return true
  if (alias.length >= 8 && token.startsWith(alias)) return true
  if (
    tokenStem.length >= 6
    && aliasStem.length >= 6
    && (tokenStem.startsWith(aliasStem.slice(0, 6)) || aliasStem.startsWith(tokenStem.slice(0, 6)))
  ) return true
  return alias.length >= 4 && token.length >= 4 && editDistanceWithinOne(token, alias)
}

export function scoreLabeledEntry(entry, tokens, question) {
  const aliases = tokenize([entry.title, ...(entry.aliases || [])].join(' '))
  const bodyTokens = new Set(tokenize([entry.summary, ...(entry.steps || [])].join(' ')))
  const tokenScore = tokens.reduce((score, token) => {
    if (aliases.some((alias) => matchesAlias(token, alias))) return score + 3
    if (bodyTokens.has(token)) return score + 1
    return score
  }, 0)
  const normalized = String(question || '').toLowerCase()
  const phrase = [entry.title, ...(entry.aliases || [])]
    .map((value) => String(value || '').toLowerCase())
    .filter((value) => value.length >= 3 && normalized.includes(value))
    .reduce((longest, value) => Math.max(longest, value.length), 0)
  return tokenScore + phrase
}
