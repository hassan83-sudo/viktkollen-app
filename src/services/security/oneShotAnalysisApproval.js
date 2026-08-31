let nextObjectIdentity = 1
const objectIdentities = new WeakMap()

function safeToken(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function getPartSource(part) {
  return part?.source || part?.file || part?.processedBlob || part
}

function getStableObjectIdentity(value) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return ''
  }

  let identity = objectIdentities.get(value)
  if (!identity) {
    identity = `obj:${nextObjectIdentity}`
    nextObjectIdentity += 1
    objectIdentities.set(value, identity)
  }

  return identity
}

export function createAnalysisApprovalKey(parts = []) {
  return parts
    .map((part) => {
      const source = getPartSource(part)
      const identitySource = part?.source || part?.file || part?.processedBlob || null

      return [
        part?.label,
        part?.name || source?.name,
        source?.size,
        source?.type,
        source?.lastModified,
        part?.preview || part?.previewUrl,
        getStableObjectIdentity(identitySource),
      ].map(safeToken).join(':')
    })
    .join('|')
}

export function createOneShotAnalysisApproval() {
  let approvedKey = ''

  return {
    approve(key) {
      approvedKey = safeToken(key)
    },
    clear() {
      approvedKey = ''
    },
    consume(key) {
      const keyToConsume = safeToken(key)
      const approved = Boolean(approvedKey && keyToConsume && approvedKey === keyToConsume)
      approvedKey = ''
      return approved
    },
    has(key) {
      const currentKey = safeToken(key)
      return Boolean(approvedKey && currentKey && approvedKey === currentKey)
    },
  }
}
