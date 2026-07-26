export const cloudErrorCodes = {
  BACKUP_NOT_FOUND: 'BACKUP_NOT_FOUND',
  CONFLICT_DETECTED: 'CONFLICT_DETECTED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  NETWORK_ERROR: 'NETWORK_ERROR',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  TABLE_MISSING: 'TABLE_MISSING',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
}

export function classifyCloudError(error, { configured = true } = {}) {
  const message = String(error?.message || error || '').toLocaleLowerCase('sv-SE')
  const code = String(error?.code || '').toLocaleLowerCase('sv-SE')

  if (!configured) {
    return cloudErrorCodes.NOT_CONFIGURED
  }

  if (
    message.includes('ingen inloggad') ||
    message.includes('not logged') ||
    message.includes('jwt') ||
    message.includes('session') ||
    message.includes('auth')
  ) {
    return cloudErrorCodes.NOT_AUTHENTICATED
  }

  if (
    message.includes('relation') ||
    message.includes('does not exist') ||
    message.includes('column') ||
    code === '42p01' ||
    code === '42703' ||
    code === 'pgrst205'
  ) {
    return cloudErrorCodes.TABLE_MISSING
  }

  if (
    message.includes('permission') ||
    message.includes('policy') ||
    message.includes('rls') ||
    code === '42501'
  ) {
    return cloudErrorCodes.PERMISSION_DENIED
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed')
  ) {
    return cloudErrorCodes.NETWORK_ERROR
  }

  if (message.includes('rate') || code === '429') {
    return cloudErrorCodes.RATE_LIMITED
  }

  return cloudErrorCodes.UNKNOWN_ERROR
}

export function getCloudErrorMessage(code) {
  const messages = {
    [cloudErrorCodes.BACKUP_NOT_FOUND]: 'Ingen molnbackup hittades.',
    [cloudErrorCodes.CONFLICT_DETECTED]: 'Både lokal data och molndata verkar ha ändrats. Välj manuellt vilken version du vill behålla.',
    [cloudErrorCodes.INVALID_PAYLOAD]: 'Backupen har ett ogiltigt format och kan inte användas.',
    [cloudErrorCodes.NETWORK_ERROR]: 'Kunde inte nå molntjänsten. Kontrollera anslutningen och försök igen.',
    [cloudErrorCodes.NOT_AUTHENTICATED]: 'Logga in för att använda molnbackup.',
    [cloudErrorCodes.NOT_CONFIGURED]: 'Supabase är inte konfigurerat. Din lokala data fungerar fortfarande.',
    [cloudErrorCodes.PERMISSION_DENIED]: 'Molnåtkomsten nekades. Kontrollera databasens säkerhetspolicyer.',
    [cloudErrorCodes.RATE_LIMITED]: 'För många försök på kort tid. Försök igen senare.',
    [cloudErrorCodes.TABLE_MISSING]: 'Molnbackup är inte färdigkonfigurerad ännu. Kör SQL-filen i Supabase när du är redo.',
    [cloudErrorCodes.UNKNOWN_ERROR]: 'Molnåtgärden misslyckades. Din lokala data påverkas inte.',
  }

  return messages[code] || messages[cloudErrorCodes.UNKNOWN_ERROR]
}

export function makeCloudFailure(action, error, extra = {}) {
  const code = extra.code || classifyCloudError(error, extra)

  return {
    action,
    code,
    ok: false,
    reason: getCloudErrorMessage(code),
    ...extra,
  }
}
