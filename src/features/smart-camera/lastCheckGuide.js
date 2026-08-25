export const lastCheckSteps = Object.freeze([
  { id: 'me', label: 'Mig' },
  { id: 'hair-face', label: 'Hår/ansikte' },
  { id: 'outfit-front', label: 'Outfit fram' },
  { id: 'outfit-back', label: 'Outfit bak' },
  { id: 'bag', label: 'Väska/saker' },
  { id: 'essentials', label: 'Viktiga saker' },
  { id: 'checklist', label: 'Personlig checklista' },
  { id: 'weather', label: 'Väder' },
  { id: 'done', label: 'Klar' },
])

export function createLastCheckState() {
  return lastCheckSteps.reduce((state, step) => {
    state[step.id] = false
    return state
  }, {})
}

export const getReadyPromptDisclaimer = 'Appen vet inte vilket rum du är i om den inte faktiskt kan avgöra det. Markera själv det du har gjort. Kameran är valfri hjälp, inte ett bevis.'
