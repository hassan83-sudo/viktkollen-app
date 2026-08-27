export const defaultAppSectionId = 'home'

export const appSections = [
  {
    ariaLabel: 'Öppna översikten',
    icon: '⌂',
    id: 'home',
    label: 'Hem',
  },
  {
    ariaLabel: 'Öppna coach och insikter',
    icon: '✦',
    id: 'coach',
    label: 'Coach',
  },
  {
    ariaLabel: 'Öppna mat och nutrition',
    icon: '+',
    id: 'nutrition',
    label: 'Mat',
  },
  {
    ariaLabel: 'Öppna vikt och framsteg',
    icon: '↗',
    id: 'progress',
    label: 'Framsteg',
  },
  {
    ariaLabel: 'Öppna Social Room',
    icon: '💬',
    id: 'social',
    label: 'Rummet',
  },
  {
    ariaLabel: 'Öppna fler funktioner och inställningar',
    icon: '⚙',
    id: 'more',
    label: 'Mer',
  },
]

const appSectionIds = new Set(appSections.map((section) => section.id))

export function isAppSectionId(value) {
  return appSectionIds.has(value)
}

export function normalizeAppSectionId(value) {
  return isAppSectionId(value) ? value : defaultAppSectionId
}

export function getAppSection(sectionId) {
  const normalizedId = normalizeAppSectionId(sectionId)

  return appSections.find((section) => section.id === normalizedId) || appSections[0]
}

export function getAppSectionIndex(sectionId) {
  const normalizedId = normalizeAppSectionId(sectionId)

  return appSections.findIndex((section) => section.id === normalizedId)
}

export function getAdjacentAppSection(sectionId, direction = 1) {
  const currentIndex = getAppSectionIndex(sectionId)
  const offset = direction < 0 ? -1 : 1
  const nextIndex = (currentIndex + offset + appSections.length) % appSections.length

  return appSections[nextIndex]
}
