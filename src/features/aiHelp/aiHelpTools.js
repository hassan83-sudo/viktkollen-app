import { appSections, secondaryAppSectionIds } from '../../services/navigation/appSections.js'
import { moreHubFolders } from '../../services/more/moreFolders.js'
import { knowledgeCatalog } from './knowledgeCatalog.js'

const sectionIds = new Set([
  ...appSections.map((section) => section.id),
  ...secondaryAppSectionIds,
  ...moreHubFolders.map((folder) => folder.id),
  'notices',
])

export function isAiHelpSectionAllowed(sectionId) {
  return sectionIds.has(String(sectionId || ''))
}

export function toolForSection(sectionId, title) {
  if (!isAiHelpSectionAllowed(sectionId)) return null
  return {
    label: `Öppna ${title}`,
    name: 'open-section',
    sectionId,
  }
}

export function sanitizeHelpTool(tool, entries = []) {
  if (!tool || tool.name !== 'open-section') return null
  const sectionId = String(tool.sectionId || '')
  if (!isAiHelpSectionAllowed(sectionId)) return null
  if (entries.length && !entries.some((entry) => entry.sectionId === sectionId)) return null
  const titles = knowledgeCatalog
    .filter((entry) => entry.sectionId === sectionId)
    .map((entry) => entry.title)
  const entry = entries.find((item) => item.sectionId === sectionId)
  const title = titles.find((item) => tool.label === `Öppna ${item}`) || entry?.title || titles[0]
  return toolForSection(sectionId, title || 'avsnittet')
}

export function listAllowedHelpSections() {
  return [...sectionIds]
}

export function commitHelpSectionOpen(sectionId, {
  changeSection,
  noticesEnabled = true,
  socialEnabled = true,
} = {}) {
  if (!isAiHelpSectionAllowed(sectionId)) return false
  if (sectionId === 'social' && !socialEnabled) return false
  if (sectionId === 'notices' && !noticesEnabled) return false
  if (typeof changeSection !== 'function') return false
  return changeSection(sectionId) !== false
}

export function requestOpenHelpSection(sectionId) {
  if (typeof window === 'undefined' || !isAiHelpSectionAllowed(sectionId)) return false
  window.dispatchEvent(new CustomEvent('viktkollen:ai-help-open-section', {
    detail: { sectionId },
  }))
  return true
}
