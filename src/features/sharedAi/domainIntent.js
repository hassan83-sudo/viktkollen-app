const helpPattern = /\b(var|vart|hur)\b[\s\S]{0,40}\b(finns|hittar|ligger|öppnar|öppna|ser|ändrar|använder)\b|\b(inställning|abonnemang|viktgraf|min resa|kostar|pris)\b/i
const coachPattern = /\bvarför\b|\b(planat|står still|platå|protein|proteinrik|måltid|aktivitet|promenad|fokusera|fokus|komma igång|igång igen|vana|vanor|vikttrend|viktutveckling|mitt mål|förstört|gått upp|gått ner|min vikt)\b/i

export function classifyDomainIntent(question) {
  const text = String(question || '').trim()
  const help = helpPattern.test(text)
  const coach = coachPattern.test(text)
  let domain = 'unclear'
  if (coach && !help) domain = 'coach'
  else if (help && !coach) domain = 'help'
  else if (coach && help) {
    domain = /\bvarför\b|\b(planat|står still|platå|protein|måltid|aktivitet|vana|vanor|mitt mål|min vikt)\b/i.test(text) ? 'coach' : 'help'
  }
  return {
    domain,
    handoff: false,
    performed: false,
  }
}
