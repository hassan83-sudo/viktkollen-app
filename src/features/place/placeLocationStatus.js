export function formatRelativeLocationUpdate(value, now = Date.now()) {
  const timestamp = value ? new Date(value).getTime() : NaN
  if (!Number.isFinite(timestamp)) return 'GPS ej tillgänglig'

  const ageMs = Math.max(0, now - timestamp)
  const ageSeconds = Math.floor(ageMs / 1000)
  if (ageSeconds < 45) return 'Uppdaterad nyss'

  const ageMinutes = Math.floor(ageSeconds / 60)
  if (ageMinutes < 60) return `Uppdaterad för ${ageMinutes} min sedan`

  const ageHours = Math.floor(ageMinutes / 60)
  if (ageHours < 24) return `Uppdaterad för ${ageHours} ${ageHours === 1 ? 'timme' : 'timmar'} sedan`

  const ageDays = Math.floor(ageHours / 24)
  return `Uppdaterad för ${ageDays} ${ageDays === 1 ? 'dag' : 'dagar'} sedan`
}

export function getOwnLocationStatus({ sharingEnabled, active, paused, lastUpdatedAt }) {
  if (!sharingEnabled) return 'Platsdelning pausad'
  if (paused) return 'GPS pausad i bakgrunden'
  if (active) return `GPS aktiv · ${formatRelativeLocationUpdate(lastUpdatedAt)}`
  if (lastUpdatedAt) return `GPS väntar · ${formatRelativeLocationUpdate(lastUpdatedAt)}`
  return 'GPS startar – ingen position ännu'
}
