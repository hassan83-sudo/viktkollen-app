export const moreHubFolders = [
  {
    id: 'sakerhet-backup',
    accent: 'purple',
    description: 'Backup, återställ, synk, moln',
    icon: '☁',
    title: 'Säkerhet & Backup',
  },
  {
    id: 'notiser',
    accent: 'cyan',
    description: 'Smarta notiser, påminnelser, planer',
    icon: '🔔',
    title: 'Notiser & Påminnelser',
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
  'dagliga-paminnelser': 'notiser',
  'data-export': 'import-export',
  'data-import': 'import-export',
  installningar: 'installningar',
  'mal-framsteg': 'mal-framsteg',
  'mal-framsteg-oversikt': 'mal-framsteg',
  molnbackup: 'sakerhet-backup',
  molnstatus: 'sakerhet-backup',
  'notification-center': 'notiser',
  'quiet-hours': 'notiser',
  'reminder-center': 'notiser',
  sakerhet: 'sakerhet-backup',
}

export function resolveMoreFolderFromTarget(targetId) {
  const id = String(targetId || '').replace(/^#/, '')
  if (!id || id === 'app-section-more' || id === 'more') return null
  if (moreHubFolders.some((folder) => folder.id === id)) return id
  return moreHubTargetFolders[id] || null
}
