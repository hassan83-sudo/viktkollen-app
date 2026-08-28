export const defaultAppSectionId = 'home'

/** Primary bottom-nav sections: Hem · Redo! · Plats · Notis · Stället · Mer */
export const appSections = [
  {
    ariaLabel: 'Öppna översikten',
    icon: '⌂',
    id: 'home',
    label: 'Hem',
  },
  {
    ariaLabel: 'Öppna Redo!',
    icon: '✓',
    id: 'redo',
    label: 'Redo!',
  },
  {
    ariaLabel: 'Öppna Plats',
    icon: '📍',
    id: 'place',
    label: 'Plats',
  },
  {
    ariaLabel: 'Öppna notiser och minnesstöd',
    icon: '🔔',
    id: 'notices',
    label: 'Notis',
  },
  {
    ariaLabel: 'Öppna Stället',
    icon: '🛋',
    id: 'social',
    label: 'Stället',
  },
  {
    ariaLabel: 'Öppna fler funktioner och inställningar',
    icon: '⚙',
    id: 'more',
    label: 'Mer',
  },
]

/** Deep-link / Mer destinations kept routable without bottom-nav tabs. */
export const secondaryAppSectionIds = Object.freeze(['coach', 'nutrition', 'progress', 'wellbeing'])

const primaryAppSectionIds = new Set(appSections.map((section) => section.id))
const secondaryIds = new Set(secondaryAppSectionIds)
const appSectionIds = new Set([...primaryAppSectionIds, ...secondaryIds])

export function isAppSectionId(value) {
  return appSectionIds.has(value)
}

export function isPrimaryAppSectionId(value) {
  return primaryAppSectionIds.has(value)
}

export function getBottomNavActiveSectionId(activeSection) {
  if (secondaryAppSectionIds.includes(activeSection)) {
    return 'more'
  }
  return isPrimaryAppSectionId(activeSection) ? activeSection : defaultAppSectionId
}

export function normalizeAppSectionId(value) {
  return isAppSectionId(value) ? value : defaultAppSectionId
}

export function getAppSection(sectionId) {
  const normalizedId = normalizeAppSectionId(sectionId)
  return appSections.find((section) => section.id === normalizedId)
    || appSections[0]
}

export function getAppSectionIndex(sectionId) {
  const normalizedId = normalizeAppSectionId(sectionId)
  const index = appSections.findIndex((section) => section.id === normalizedId)
  return index >= 0 ? index : 0
}

export function getAdjacentAppSection(sectionId, direction = 1) {
  const currentIndex = getAppSectionIndex(sectionId)
  const offset = direction < 0 ? -1 : 1
  const nextIndex = (currentIndex + offset + appSections.length) % appSections.length
  return appSections[nextIndex]
}
