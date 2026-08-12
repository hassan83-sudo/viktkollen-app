import { appSections, getAppSection } from './appSections.js'

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeSearchText(value) {
  return stripDiacritics(value)
    .toLocaleLowerCase('sv-SE')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function createItem({
  description,
  icon,
  id,
  keywords = [],
  section,
  targetId,
  title,
}) {
  const sectionConfig = getAppSection(section)

  return {
    description,
    icon: icon || sectionConfig.icon,
    id,
    keywords,
    section,
    targetId,
    title,
  }
}

const sectionKeywords = Object.fromEntries(appSections.map((section) => [
  section.id,
  [section.label, section.ariaLabel],
]))

export const globalSearchItems = [
  createItem({
    description: 'Dashboard, daglig progress och smarta rekommendationer',
    id: 'home-dashboard',
    keywords: ['hem', 'dashboard', 'översikt', 'start', 'daily progress', 'health score'],
    section: 'home',
    targetId: 'hem',
    title: 'Hem / Dashboard',
  }),
  createItem({
    description: 'Logga vikt, se viktutveckling och framsteg',
    id: 'weight-progress',
    keywords: ['vikt', 'registrera vikt', 'logga vikt', 'viktutveckling', 'weight', 'progress'],
    section: 'progress',
    targetId: 'vikt',
    title: 'Registrera vikt',
  }),
  createItem({
    description: 'Personliga framstegsinsikter, trend, platå och nästa steg',
    id: 'progress-insights',
    keywords: ['progress insights', 'framstegsinsikter', 'utveckling', 'trend', 'platå', 'plata', 'progress', 'ai progress insights'],
    section: 'progress',
    targetId: 'progress-insights',
    title: 'AI Progress Insights',
  }),
  createItem({
    description: 'Progressbilder och före/efter-jämförelse',
    id: 'progress-photos',
    keywords: ['progress photos', 'progressbilder', 'bilder', 'före efter', 'before after', 'foto'],
    section: 'progress',
    targetId: 'framstegsbilder',
    title: 'Progress Photos',
  }),
  createItem({
    description: 'Guidad Body Scan med fram-, sido- och bakbild',
    id: 'body-scan',
    keywords: ['body scan', 'bodyscan', 'body-scan', 'body', 'kropp', 'kroppsanalys', 'kroppsscanning', 'scanna kroppen', 'progressbild', 'ai kroppsanalys'],
    section: 'progress',
    targetId: 'body-analysis',
    title: 'AI Kroppsanalys',
  }),
  createItem({
    description: 'Rapporter, trender, integritet och export',
    id: 'reports',
    keywords: ['rapport', 'rapporter', 'reports', 'report center', 'veckorapport', 'månadsrapport', 'monthly report', 'weekly report', 'export'],
    section: 'progress',
    targetId: 'rapportcenter',
    title: 'Reports / Report Center',
  }),
  createItem({
    description: 'Måltider, kalorier, protein och snabb loggning',
    id: 'meals',
    keywords: ['mat', 'måltider', 'lägg till måltid', 'logga mat', 'meal', 'meals', 'nutrition', 'kalorier', 'protein'],
    section: 'nutrition',
    targetId: 'maltider',
    title: 'Måltider',
  }),
  createItem({
    description: 'Kalorier, protein och smarta råd',
    id: 'nutrition-dashboard',
    keywords: ['nutrition dashboard', 'kostråd', 'protein', 'kalorier', 'näring', 'food score'],
    section: 'nutrition',
    targetId: 'nutrition-view-panel',
    title: 'Nutrition Dashboard',
  }),
  createItem({
    description: 'Personliga råd för kalorier, protein och veckomönster',
    id: 'nutrition-coach',
    keywords: ['nutrition coach', 'kostcoach', 'näringscoach', 'proteinråd', 'kaloriråd', 'smarta råd'],
    section: 'coach',
    targetId: 'nutrition-coach-center',
    title: 'Nutrition Coach',
  }),
  createItem({
    description: 'Dagens plan, veckomeny och inköpslista',
    id: 'meal-planner',
    keywords: ['matplan', 'meal planner', 'matplanering', 'veckomeny', 'måltidsplan', 'weekly meal planner', 'inköpslista'],
    section: 'nutrition',
    targetId: 'meal-planner',
    title: 'Meal Planner',
  }),
  createItem({
    description: 'Spara, återanvänd och redigera veckans måltider',
    id: 'weekly-meal-planner',
    keywords: ['weekly meal planner', 'veckoplan', 'veckomeny', 'planera måltider', 'spara till veckoplan'],
    section: 'nutrition',
    targetId: 'weekly-meal-planner-title',
    title: 'Weekly Meal Planner',
  }),
  createItem({
    description: 'Skanna streckkod eller analysera matbild',
    id: 'scanner',
    keywords: ['skanna mat', 'scanner', 'streckkod', 'barcode', 'nutrition scanner', 'matbild', 'foto mat'],
    section: 'nutrition',
    targetId: 'nutrition-scanner-v2',
    title: 'Nutrition Scanner',
  }),
  createItem({
    description: 'Prata eller chatta med din coach',
    id: 'ai-coach',
    keywords: ['ai', 'coach', 'chat', 'chatt', 'röst', 'voice', 'prata med ai', 'voice conversation', 'ai coach'],
    section: 'coach',
    targetId: 'chat',
    title: 'AI Coach',
  }),
  createItem({
    description: 'Prognoser, trend och nästa steg',
    id: 'health-prediction',
    keywords: ['health prediction', 'prediction', 'prognos', 'trend', 'målvikt', 'health score'],
    section: 'home',
    targetId: 'health-prediction',
    title: 'Health Prediction',
  }),
  createItem({
    description: 'Senaste 7 dagarna för vikt, score, kalorier, protein och steg',
    id: 'weekly-progress',
    keywords: ['weekly progress', 'den här veckan', 'veckoprogress', '7 dagar', 'steg', 'proteinmål'],
    section: 'home',
    targetId: 'weekly-progress',
    title: 'Weekly Progress',
  }),
  createItem({
    description: 'Badges, delmål och nästa achievement',
    id: 'achievements',
    keywords: ['achievements', 'badges', 'märken', 'delmål', 'mål', 'streak'],
    section: 'home',
    targetId: 'achievements',
    title: 'Achievements',
  }),
  createItem({
    description: 'Smart Notifications och notiscenter',
    id: 'notifications',
    keywords: ['smart notifications', 'smarta notiser', 'rekommendationer', 'pending', 'visa alla'],
    section: 'home',
    targetId: 'smart-notifications',
    title: 'Smart Notifications',
  }),
  createItem({
    description: 'Hantera notiser, klarmarkering, snooze och ignorera',
    id: 'notification-center',
    keywords: ['notifications', 'notiser', 'notification center', 'aviseringar', 'klar', 'snooze', 'ignorera'],
    section: 'more',
    targetId: 'notification-center',
    title: 'Notifications',
  }),
  createItem({
    description: 'Påminnelser, snooze och schemaläggning',
    id: 'reminders',
    keywords: ['reminders', 'påminnelser', 'reminder center', 'snooze', 'check in', 'checkins'],
    section: 'more',
    targetId: 'reminder-center',
    title: 'Reminders',
  }),
  createItem({
    description: 'Molnbackup, återställning och konflikter',
    id: 'cloud-backup',
    keywords: ['backup', 'säkerhetskopia', 'cloud', 'moln', 'återställ', 'restore', 'sync', 'supabase'],
    section: 'more',
    targetId: 'molnbackup',
    title: 'Cloud Backup',
  }),
  createItem({
    description: 'Importera data från säkerhetskopia',
    id: 'import',
    keywords: ['import', 'importera', 'restore', 'återställ', 'dataimport'],
    section: 'more',
    targetId: 'data-import',
    title: 'Import',
  }),
  createItem({
    description: 'Exportera rapporter och data',
    id: 'export',
    keywords: ['export', 'exportera', 'dataexport', 'download', 'ladda ned', 'rapport export'],
    section: 'more',
    targetId: 'data-export',
    title: 'Export',
  }),
  createItem({
    description: 'Profil, mål och konto',
    id: 'profile-settings',
    keywords: ['profil', 'inställningar', 'settings', 'konto', 'mål', 'ändra profil'],
    section: 'more',
    targetId: 'installningar',
    title: 'Profil / Inställningar',
  }),
].map((item) => ({
  ...item,
  keywords: [...new Set([item.title, item.description, ...(sectionKeywords[item.section] || []), ...item.keywords])],
}))

export function searchGlobalNavigation(query, items = globalSearchItems) {
  const normalizedQuery = normalizeSearchText(query)
  const compactQuery = compact(query)

  if (!normalizedQuery) return []

  return items
    .map((item) => {
      const haystack = item.keywords.map(normalizeSearchText)
      const compactHaystack = item.keywords.map(compact)
      const exact = haystack.some((entry) => entry === normalizedQuery)
      const startsWith = haystack.some((entry) => entry.startsWith(normalizedQuery))
      const includes = haystack.some((entry) => entry.includes(normalizedQuery))
      const compactIncludes = compactQuery.length > 1 && compactHaystack.some((entry) => entry.includes(compactQuery))

      if (!exact && !startsWith && !includes && !compactIncludes) return null

      return {
        ...item,
        score: exact ? 0 : startsWith ? 1 : compactIncludes ? 2 : 3,
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.score - second.score || first.title.localeCompare(second.title, 'sv-SE'))
    .slice(0, 8)
}

export function getNextSearchSelection(currentIndex, resultCount, direction) {
  if (resultCount <= 0) return -1
  const offset = direction < 0 ? -1 : 1

  return (currentIndex + offset + resultCount) % resultCount
}

export function getGlobalSearchKeyboardAction(event, selectedIndex, resultCount) {
  if (event?.key === 'Escape') return { type: 'close' }
  if (event?.key === 'Enter') return { index: selectedIndex, type: 'navigate' }
  if (event?.key === 'ArrowDown') {
    return {
      index: getNextSearchSelection(selectedIndex, resultCount, 1),
      type: 'select',
    }
  }
  if (event?.key === 'ArrowUp') {
    return {
      index: getNextSearchSelection(selectedIndex, resultCount, -1),
      type: 'select',
    }
  }

  return { type: 'none' }
}

export function isGlobalSearchOpenShortcut(event) {
  return Boolean((event?.ctrlKey || event?.metaKey) && String(event?.key || '').toLowerCase() === 'k')
}
