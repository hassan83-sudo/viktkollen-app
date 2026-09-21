import { appSections, getAppSection } from './appSections.js'
import { getFeatureFlags, isFeatureEnabled } from '../../features/featureRegistry.js'
import { resolveMoreFolderFromTarget } from '../more/moreFolders.js'

const moreSearchSections = new Set(['progress', 'nutrition', 'coach', 'wellbeing', 'economy', 'more'])

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
  action,
  description,
  featureFlag,
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
    action,
    description,
    featureFlag,
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
    targetId: 'app-section-home',
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
    section: 'home',
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
    targetId: 'ai-coach',
    title: 'AI Coach',
  }),
  createItem({
    description: 'Frivillig check-in, lugna övningar och trygghetsplan',
    id: 'wellbeing',
    keywords: ['må bra', 'mabra', 'välmående', 'maende', 'mående', 'oro', 'stress', 'trygghetsplan', 'andas', 'jordning', '112', 'wellbeing'],
    priority: 9,
    section: 'wellbeing',
    suggestionGroup: 'Förslag för dig',
    targetId: 'wellbeing-center',
    title: 'Må bra',
  }),
  createItem({
    description: 'Utgifter, budget, skulder, räkningar och sparande',
    id: 'economy',
    keywords: ['ekonomi', 'budget', 'utgifter', 'köp', 'skulder', 'räkningar', 'sparande', 'abonnemang', 'economy'],
    priority: 10,
    section: 'economy',
    suggestionGroup: 'Förslag för dig',
    targetId: 'economy-center',
    title: 'Ekonomi',
  }),
  createItem({
    description: 'STS, vanliga fraser, övning och ärligt AI-textstöd',
    id: 'sign-language',
    keywords: ['teckenspråk', 'teckensprak', 'sts', 'svenskt teckenspråk', 'asl', 'bsl', 'tecken ai', 'sign language'],
    priority: 11,
    section: 'more',
    suggestionGroup: 'Förslag för dig',
    targetId: 'sign-language',
    title: 'Teckenspråk',
  }),
  createItem({
    description: 'Djur, insekter, beteenden och faktagranskade videospår',
    id: 'animal-world',
    keywords: ['djurvärlden', 'djurvarlden', 'djur', 'insekter', 'naturguide', 'måsar', 'pingvin', 'axolotl', 'animal world'],
    priority: 14,
    section: 'more',
    suggestionGroup: 'Förslag för dig',
    targetId: 'animal-world',
    title: 'Djurvärlden',
  }),
  createItem({
    description: 'Graviditet, första året, BVC, 1177 och akutväg',
    id: 'pregnancy-first-year',
    keywords: ['graviditet', 'första året', 'forsta aret', 'bebis', 'baby', 'bvc', '1177', '112', 'förälder', 'pregnancy'],
    priority: 15,
    section: 'more',
    suggestionGroup: 'Förslag för dig',
    targetId: 'pregnancy-first-year',
    title: 'Graviditet & första året',
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
    description: 'Smart Notifications på startsidan',
    id: 'notifications',
    keywords: ['smart notifications', 'smarta notiser', 'rekommendationer', 'pending', 'visa alla', 'notifications'],
    section: 'home',
    targetId: 'smart-notifications',
    title: 'Smart Notifications',
  }),
  createItem({
    description: 'Notiser, påminnelser och minnesstöd',
    featureFlag: 'reminderHubUi',
    id: 'notices',
    keywords: ['notiser', 'notices', 'påminnelser', 'reminder', 'reminders', 'snooze', 'aviseringar', 'minnesstöd', 'notice hub'],
    priority: 13,
    section: 'notices',
    suggestionGroup: 'Snabbåtgärder',
    targetId: 'app-section-notices',
    title: 'Notiser',
  }),
  createItem({
    description: 'Redo-läge, checklista och sista kollen',
    id: 'redo',
    keywords: ['redo', 'redo!', 'checklista', 'glömt', 'sista kollen'],
    priority: 8,
    section: 'redo',
    suggestionGroup: 'Populärt',
    targetId: 'app-section-redo',
    title: 'Redo!',
  }),
  createItem({
    description: 'Karta, platsdelning och familjeöversikt',
    id: 'place',
    keywords: ['plats', 'karta', 'location', 'familjekarta', 'gps'],
    priority: 17,
    section: 'place',
    targetId: 'app-section-place',
    title: 'Plats',
  }),
  createItem({
    description: 'Översikt över framsteg, mat, aktivitet och mål',
    id: 'journey',
    keywords: ['min resa', 'resa', 'journey', 'historik', 'översikt resa'],
    priority: 16,
    section: 'journey',
    targetId: 'app-section-journey',
    title: 'Min resa',
  }),
  createItem({
    description: 'Lugn chatt, vänner och rummet Stället',
    featureFlag: 'socialUi',
    id: 'social',
    keywords: ['stället', 'social', 'vänner', 'chatt', 'rum'],
    priority: 19,
    section: 'social',
    targetId: 'app-section-social',
    title: 'Stället',
  }),
  createItem({
    description: 'Steg, träning, distans och aktiv tid',
    id: 'activity',
    keywords: ['aktivitet', 'steg', 'träning', 'distans', 'aktiv tid', 'activity'],
    priority: 14,
    section: 'more',
    targetId: 'aktivitet',
    title: 'Aktivitet',
  }),
  createItem({
    description: 'Medicin, vardag, minnen och nöje',
    id: 'senior-65-plus',
    keywords: ['65+', '65 plus', 'senior', 'äldre', 'vardag', 'min vardag'],
    priority: 20,
    section: 'more',
    suggestionGroup: 'Förslag för dig',
    targetId: 'senior-65-plus',
    title: '65+ · Min vardag',
  }),
  createItem({
    description: 'Krav, förfallodatum, betalningar och mer tid',
    id: 'inkasso',
    keywords: ['inkasso', 'skuld', 'betalning', 'krav', 'förfallodatum'],
    priority: 21,
    section: 'more',
    targetId: 'inkasso',
    title: 'Inkasso',
  }),
  createItem({
    description: 'Ärenden, skulder, deadlines och betalningsöversikt',
    id: 'kronofogden',
    keywords: ['kronofogden', 'skuld', 'ärende', 'deadline', 'utmätning'],
    priority: 22,
    section: 'more',
    targetId: 'kronofogden',
    title: 'Kronofogden',
  }),
  createItem({
    description: 'Backup-historik och loggar',
    id: 'archive-history',
    keywords: ['arkiv', 'historik', 'backup-historik', 'loggar', 'arkiv & historik'],
    priority: 23,
    section: 'more',
    targetId: 'arkiv-historik',
    title: 'Arkiv & Historik',
  }),
  createItem({
    action: 'openSmartCamera',
    description: 'Smart kamera, AI Ögat, minne och sista kollen',
    featureFlag: 'smartCamera',
    id: 'smart-camera',
    keywords: ['smart kamera', 'ai ögat', 'ögat', 'kamera', 'bild', 'minne', 'sista kollen'],
    priority: 7,
    section: 'home',
    suggestionGroup: 'Populärt',
    targetId: 'app-section-home',
    title: 'Smart kamera / AI Ögat',
  }),
  createItem({
    description: 'Språk och översättning i appen',
    id: 'language-settings',
    keywords: ['språk', 'language', 'översättning', 'locale', 'svenska'],
    priority: 24,
    section: 'more',
    targetId: 'language-settings',
    title: 'Språk',
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

export function getVisibleGlobalSearchItems(flags = getFeatureFlags(), items = globalSearchItems) {
  return items.filter((item) => !item.featureFlag || isFeatureEnabled(item.featureFlag, flags))
}

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

export function resolveGlobalSearchDestination(result, flags = getFeatureFlags()) {
  if (!result) return null

  if (result.featureFlag && !isFeatureEnabled(result.featureFlag, flags)) {
    return { blocked: true, reason: result.featureFlag }
  }

  if (result.action === 'openSmartCamera') {
    return {
      blocked: false,
      homeIntent: { mode: 'forgotten' },
      moreFolder: null,
      nutritionIntent: null,
      sectionId: 'home',
      targetId: 'app-section-home',
    }
  }

  const requestedSection = result.section || 'home'
  const moreFolder = resolveMoreFolderFromTarget(result.targetId)
  const sectionId = moreSearchSections.has(requestedSection) || moreFolder ? 'more' : requestedSection
  const targetId = result.targetId
    || (requestedSection === 'nutrition' ? 'mat'
      : requestedSection === 'coach' ? 'ai-coach'
        : requestedSection === 'wellbeing' ? 'ma-bra'
          : requestedSection === 'economy' ? 'ekonomi'
            : requestedSection === 'progress' ? 'mal-framsteg'
              : `app-section-${sectionId}`)

  return {
    blocked: false,
    homeIntent: null,
    moreFolder: sectionId === 'more' ? (moreFolder || resolveMoreFolderFromTarget(targetId)) : null,
    nutritionIntent: result.targetId === 'nutrition-scanner-v2' || result.targetId === 'scanner'
      ? { panel: 'scanner' }
      : null,
    sectionId,
    targetId,
  }
}
