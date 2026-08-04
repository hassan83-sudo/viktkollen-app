export const acceptanceStatuses = {
  acceptedLimitation: 'acceptedLimitation',
  automatedPass: 'automatedPass',
  blockedByEnvironment: 'blockedByEnvironment',
  failed: 'failed',
  manuallyVerified: 'manuallyVerified',
  notRun: 'notRun',
}

const validStatuses = new Set(Object.values(acceptanceStatuses))
const unsafePattern = /sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+|password|token|secret|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE/i

function safeText(value, max = 240) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(unsafePattern, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function createAcceptanceCheck({
  area,
  blocker = '',
  environment = 'local',
  id,
  notes = '',
  safeEvidence = '',
  status = acceptanceStatuses.notRun,
  verifiedAt = null,
} = {}) {
  const normalizedStatus = validStatuses.has(status) ? status : acceptanceStatuses.notRun

  return {
    area: safeText(area, 80) || 'unknown',
    blocker: safeText(blocker, 220),
    environment: safeText(environment, 80) || 'local',
    id: safeText(id, 80) || 'acceptance-check',
    notes: safeText(notes, 400),
    safeEvidence: safeText(safeEvidence, 400),
    status: normalizedStatus,
    verifiedAt: verifiedAt || null,
  }
}

export function createAcceptanceResult({
  checks = [],
  environment = 'local',
  generatedAt = new Date().toISOString(),
  releaseStatus = 'CONDITIONAL',
} = {}) {
  const normalizedChecks = checks.map(createAcceptanceCheck)

  return {
    checks: normalizedChecks,
    environment: safeText(environment, 80) || 'local',
    generatedAt,
    releaseStatus: safeText(releaseStatus, 40) || 'CONDITIONAL',
    schemaVersion: 1,
    summary: {
      acceptedLimitation: normalizedChecks.filter((check) => check.status === acceptanceStatuses.acceptedLimitation).length,
      automatedPass: normalizedChecks.filter((check) => check.status === acceptanceStatuses.automatedPass).length,
      blockedByEnvironment: normalizedChecks.filter((check) => check.status === acceptanceStatuses.blockedByEnvironment).length,
      failed: normalizedChecks.filter((check) => check.status === acceptanceStatuses.failed).length,
      manuallyVerified: normalizedChecks.filter((check) => check.status === acceptanceStatuses.manuallyVerified).length,
      notRun: normalizedChecks.filter((check) => check.status === acceptanceStatuses.notRun).length,
    },
  }
}

export function serializeAcceptanceResult(result) {
  return `${JSON.stringify(createAcceptanceResult(result), null, 2)}\n`
}

export function validateAcceptanceResult(result) {
  const errors = []
  if (!result || typeof result !== 'object') errors.push('result')
  if (result?.schemaVersion !== 1) errors.push('schemaVersion')
  if (!Array.isArray(result?.checks)) errors.push('checks')
  ;(result?.checks || []).forEach((check, index) => {
    if (!check.id) errors.push(`checks.${index}.id`)
    if (!validStatuses.has(check.status)) errors.push(`checks.${index}.status`)
    const serialized = JSON.stringify(check)
    if (unsafePattern.test(serialized)) errors.push(`checks.${index}.unsafe`)
  })

  return {
    errors,
    ok: errors.length === 0,
  }
}
