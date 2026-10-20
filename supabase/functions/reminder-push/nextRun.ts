// Nästa körning efter en skickad push. Ren funktion så att den kan testas utan Deno-servern.
export function nextRun(row: any, after: Date) {
  if (row.schedule_type === 'once') return null
  if (row.schedule_type === 'interval') return new Date(after.getTime() + Math.max(60, Number(row.interval_minutes) || 60) * 60000).toISOString()
  const weekdayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  // Dagens tillfälle räknas också, om det ligger efter `after`. Förut började sökningen i
  // morgon, så en push efter midnatt eller en sen push på morgonen hoppade över dagens tid.
  for (let offset = 0; offset <= 370; offset += 1) {
    const local = new Date(after.toLocaleString('en-US', { timeZone: row.timezone || 'Europe/Stockholm' }))
    local.setDate(local.getDate() + offset)
    const weekday = weekdayNames[local.getDay()]
    const allowed = row.schedule_type === 'daily'
      || (row.schedule_type === 'weekdays' && !['saturday','sunday'].includes(weekday))
      || (row.schedule_type === 'weekends' && ['saturday','sunday'].includes(weekday))
      || (['weekly','selected_weekdays'].includes(row.schedule_type) && (row.days_of_week || []).includes(weekday))
    if (!allowed) continue
    const dateText = `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-${String(local.getDate()).padStart(2,'0')}`
    const timeText = String(row.reminder_time || '09:00:00').slice(0,5)
    const probe = new Date(`${dateText}T${timeText}:00`)
    const offsetAt = (date: Date) => new Date(date.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
      - new Date(date.toLocaleString('en-US', { timeZone: row.timezone || 'Europe/Stockholm' })).getTime()
    // Tidszonens förskjutning läses om vid den framräknade tiden, så att nattliga tider
    // de dygn klockan ställs om inte hamnar en timme fel.
    const firstGuess = new Date(probe.getTime() + offsetAt(probe))
    const candidate = new Date(probe.getTime() + offsetAt(firstGuess))
    if (candidate.getTime() <= after.getTime()) continue
    return candidate.toISOString()
  }
  return null
}
