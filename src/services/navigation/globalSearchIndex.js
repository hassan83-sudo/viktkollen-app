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
  group = 'Förslag',
  icon,
  id,
  keywords = [],
  priority = 50,
  section,
  suggestionGroup = 'Förslag för dig',
  targetId,
  timeHints = [],
  title,
}) {
  const sectionConfig = getAppSection(section)

  return {
    description,
    group,
    icon: icon || sectionConfig.icon,
    id,
    keywords,
    priority,
    section,
    suggestionGroup,
    targetId,
    timeHints,
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
    keywords: ['hem', 'dashboard', 'översikt', 'start', 'daily progress', 'health score', 'viktkollen live'],
    priority: 2,
    section: 'home',
    suggestionGroup: 'Populärt',
    targetId: 'hem',
    title: 'Hem / Dashboard',
  }),
  createItem({
    description: 'Logga vikt, se viktutveckling och framsteg',
    id: 'weight-progress',
    keywords: ['vikt', 'registrera vikt', 'logga vikt', 'aktuell vikt', 'målvikt', 'viktgraf', 'viktkurva', 'viktutveckling', 'weight', 'progress'],
    priority: 3,
    section: 'progress',
    suggestionGroup: 'Snabbåtgärder',
    targetId: 'vikt',
    timeHints: ['morning'],
    title: 'Logga vikt',
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
    keywords: ['progress photos', 'progressbilder', 'bilder', 'före efter', 'before after', 'foto', 'kroppsfoto', 'framstegsbilder'],
    section: 'progress',
    targetId: 'framstegsbilder',
    title: 'Progress Photos',
  }),
  createItem({
    description: 'Guidad Body Scan med fram-, sido- och bakbild',
    id: 'body-scan',
    keywords: ['body scan', 'bodyscan', 'body-scan', 'body', 'kropp', 'kroppsanalys', 'kroppsscanning', 'scanna kroppen', 'scan', 'scanner', 'foto', 'progressbild', 'ai kroppsanalys'],
    priority: 7,
    section: 'progress',
    suggestionGroup: 'Populärt',
    targetId: 'body-analysis',
    title: 'Kroppsscanning',
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
    keywords: ['mat', 'måltider', 'lägg till måltid', 'lägg till mat', 'logga mat', 'meal', 'meals', 'nutrition', 'kalorier', 'protein', 'mat historik', 'mat-historik'],
    priority: 4,
    section: 'nutrition',
    suggestionGroup: 'Snabbåtgärder',
    targetId: 'maltider',
    timeHints: ['lunch', 'evening'],
    title: 'Lägg till måltid',
  }),
  createItem({
    description: 'Kalorier, protein och smarta råd',
    id: 'nutrition-dashboard',
    keywords: ['nutrition dashboard', 'kostråd', 'protein', 'kalorier', 'näring', 'food score', 'nutrition goals', 'mål näring', 'kostmål'],
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
    keywords: ['matplan', 'meal planner', 'matplanering', 'veckomeny', 'måltidsplan', 'maltidsplan', 'weekly meal planner', 'inköpslista'],
    priority: 12,
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
    keywords: ['skanna mat', 'matscanning', 'mat scan', 'scan mat', 'scanner', 'scan', 'streckkod', 'barcode', 'nutrition scanner', 'matbild', 'foto mat', 'kamera mat'],
    priority: 5,
    section: 'nutrition',
    suggestionGroup: 'Populärt',
    targetId: 'nutrition-scanner-v2',
    timeHints: ['lunch', 'evening'],
    title: 'Matscanning',
  }),
  createItem({
    description: 'Recept, idéer och sparade måltider',
    id: 'recipes',
    keywords: ['recept', 'recipe', 'recipes', 'matidéer', 'middag', 'lunch', 'favoritrecept'],
    priority: 16,
    section: 'nutrition',
    targetId: 'recipe-manager-title',
    title: 'Recept',
  }),
  createItem({
    description: 'Prata eller chatta med din coach',
    id: 'ai-coach',
    keywords: ['ai', 'coach', 'chat', 'chatt', 'röst', 'voice', 'prata med ai', 'voice conversation', 'ai coach'],
    priority: 1,
    section: 'coach',
    suggestionGroup: 'Populärt',
    targetId: 'chat',
    title: 'AI Coach',
  }),
  createItem({
    description: 'Dagens check-in för energi, steg, humör och rörelse',
    id: 'daily-checkin',
    keywords: ['check in', 'check-in', 'checkin', 'dagens check-in', 'dagens checkin', 'humör', 'energi', 'rörelse', 'steg'],
    priority: 6,
    section: 'nutrition',
    suggestionGroup: 'Snabbåtgärder',
    targetId: 'checkin',
    timeHints: ['morning', 'evening'],
    title: 'Dagens check-in',
  }),
  createItem({
    description: 'Smart Feed med tid, fallback-väder, tips och framtida stilcoach',
    id: 'viktkollen-live',
    keywords: ['viktkollen live', 'smart feed', 'feed', 'live', 'väder', 'tips', 'fakta', 'stilcoach', 'mode', 'tråkigt', 'aktivitet'],
    priority: 8,
    section: 'home',
    suggestionGroup: 'Förslag för dig',
    targetId: 'viktkollen-live',
    title: 'Viktkollen Live',
  }),
  createItem({
    description: 'Prognoser, trend och nästa steg',
    id: 'health-prediction',
    keywords: ['health prediction', 'prediction', 'prognos', 'trend', 'målvikt', 'viktprognos', 'health score'],
    section: 'home',
    targetId: 'health-prediction',
    title: 'Health Prediction',
  }),
  createItem({
    description: 'Senaste 7 dagarna för vikt, score, kalorier, protein och steg',
    id: 'weekly-progress',
    keywords: ['weekly progress', 'den här veckan', 'veckoprogress', '7 dagar', 'steg', 'proteinmål', 'veckorapport'],
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
    keywords: ['smart notifications', 'smarta notiser', 'rekommendationer', 'pending', 'visa alla', 'notifications'],
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
    keywords: ['reminders', 'påminnelser', 'påminnelse', 'reminder center', 'snooze', 'check in', 'checkins'],
    priority: 13,
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
    keywords: ['import', 'importera', 'restore', 'återställ', 'dataimport', 'import export', 'import/export'],
    section: 'more',
    targetId: 'data-import',
    title: 'Import',
  }),
  createItem({
    description: 'Exportera rapporter och data',
    id: 'export',
    keywords: ['export', 'exportera', 'dataexport', 'download', 'ladda ned', 'rapport export', 'import export', 'import/export'],
    section: 'more',
    targetId: 'data-export',
    title: 'Export',
  }),
  createItem({
    description: 'Profil, mål och konto',
    id: 'profile-settings',
    keywords: ['profil', 'inställningar', 'settings', 'konto', 'mål', 'ändra profil', 'preferences'],
    priority: 18,
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
      const tokenMatch = normalizedQuery
        .split(' ')
        .filter(Boolean)
        .every((token) => haystack.some((entry) => entry.includes(token)))
      const compactIncludes = compactQuery.length > 1 && compactHaystack.some((entry) => entry.includes(compactQuery))

      if (!exact && !startsWith && !includes && !tokenMatch && !compactIncludes) return null

      return {
        ...item,
        score: exact ? 0 : startsWith ? 1 : compactIncludes ? 2 : tokenMatch ? 3 : 4,
      }
    })
    .filter(Boolean)
    .sort((first, second) => first.score - second.score || first.priority - second.priority || first.title.localeCompare(second.title, 'sv-SE'))
    .slice(0, 10)
}

export function getDefaultGlobalSearchGroups(items = globalSearchItems) {
  const groups = ['Populärt', 'Snabbåtgärder', 'Förslag för dig', 'Senast använda']
  const grouped = new Map(groups.map((group) => [group, []]))

  items
    .slice()
    .sort((first, second) => first.priority - second.priority || first.title.localeCompare(second.title, 'sv-SE'))
    .forEach((item) => {
      const group = grouped.has(item.suggestionGroup) ? item.suggestionGroup : 'Förslag för dig'
      if (grouped.get(group).length < 5) grouped.get(group).push(item)
    })

  if (grouped.get('Senast använda').length === 0) {
    grouped.set('Senast använda', items
      .filter((item) => ['weight-progress', 'meals', 'ai-coach', 'viktkollen-live'].includes(item.id))
      .sort((first, second) => first.priority - second.priority))
  }

  return [...grouped.entries()]
    .map(([title, groupItems]) => ({ items: groupItems.slice(0, 5), title }))
    .filter((group) => group.items.length > 0)
}

export function getGlobalSearchItemsById(ids = [], items = globalSearchItems) {
  const itemById = new Map(items.map((item) => [item.id, item]))

  return ids
    .map((id) => itemById.get(id))
    .filter(Boolean)
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
