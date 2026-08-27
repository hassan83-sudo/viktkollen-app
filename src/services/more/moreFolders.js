export const moreHubFolders = [
  {
    id: 'sakerhet-backup',
    accent: 'purple',
    description: 'Backup, återställ, synk, moln',
    icon: '☁',
    title: 'Säkerhet & Backup',
  },
  {
    id: 'import-export',
    accent: 'blue',
    description: 'Dataimport, dataexport',
    icon: '⇄',
    title: 'Import & Export',
  },
  {
    id: 'mal-framsteg',
    accent: 'gold',
    description: 'Viktmål, achievements',
    icon: '◎',
    title: 'Mål & Framsteg',
  },
  {
    id: 'arkiv-historik',
    accent: 'orange',
    description: 'Backup-historik, loggar',
    icon: '▤',
    title: 'Arkiv & Historik',
  },
  {
    id: 'installningar',
    accent: 'green',
    description: 'Appinställningar, enheter',
    icon: '⚙',
    title: 'Inställningar',
  },
]

export const moreHubTargetFolders = {
  'arkiv-historik': 'arkiv-historik',
  'backup-historik': 'arkiv-historik',
  'cloud-sync': 'sakerhet-backup',
  'dagliga-paminnelser': 'mal-framsteg',
  'data-export': 'import-export',
  'data-import': 'import-export',
  installningar: 'installningar',
  'mal-framsteg': 'mal-framsteg',
  'mal-framsteg-oversikt': 'mal-framsteg',
  molnbackup: 'sakerhet-backup',
  molnstatus: 'sakerhet-backup',
  'notification-center': 'mal-framsteg',
  'quiet-hours': 'mal-framsteg',
  'reminder-center': 'mal-framsteg',
  'app-section-progress': 'mal-framsteg',
  'body-analysis': 'mal-framsteg',
  framstegsbilder: 'mal-framsteg',
  'progress-insights': 'mal-framsteg',
  rapportcenter: 'mal-framsteg',
  vikt: 'mal-framsteg',
  sakerhet: 'sakerhet-backup',
}

export function resolveMoreFolderFromTarget(targetId) {
  const id = String(targetId || '').replace(/^#/, '')
  if (!id || id === 'app-section-more' || id === 'more') return null
  if (moreHubFolders.some((folder) => folder.id === id)) return id
  return moreHubTargetFolders[id] || null
}
