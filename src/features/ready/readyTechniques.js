export const readyTechniques = Object.freeze([
  { id: 'image', icon: 'image', primary: true, noticesKey: 'image' },
  { id: 'story', icon: 'book', primary: true },
  { id: 'walk', icon: 'walk', primary: true, noticesKey: 'walk' },
  { id: 'repeat', icon: 'repeat', primary: true, noticesKey: 'repeat' },
  { id: 'associate', icon: 'link', noticesKey: 'associate' },
  { id: 'chunk', icon: 'layers', noticesKey: 'steps' },
  { id: 'acrostic', icon: 'letter' },
  { id: 'acronym', icon: 'abbr' },
  { id: 'rhyme', icon: 'music' },
  { id: 'song', icon: 'song' },
  { id: 'say', icon: 'speak', noticesKey: 'say' },
  { id: 'teach', icon: 'teach' },
  { id: 'recall', icon: 'brain' },
  { id: 'spaced', icon: 'calendar' },
  { id: 'color', icon: 'palette' },
  { id: 'photoChecklist', icon: 'camera', noticesKey: 'checklist' },
  { id: 'fixedPlace', icon: 'pin' },
  { id: 'bodyChain', icon: 'body' },
  { id: 'topThree', icon: 'three' },
  { id: 'doNow', icon: 'bolt' },
  { id: 'reverseChecklist', icon: 'reverse' },
  { id: 'objectSignal', icon: 'signal' },
  { id: 'location', icon: 'place', comingSoon: true, noticesKey: 'location' },
])

export function getPrimaryReadyTechniques() {
  return readyTechniques.filter((technique) => technique.primary)
}

export function getAllReadyTechniques() {
  return [...readyTechniques]
}

export function getReadyTechnique(id) {
  return readyTechniques.find((technique) => technique.id === id) || null
}
