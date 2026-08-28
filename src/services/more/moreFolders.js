export const moreHubFolders = [
  {
    id: 'mal-framsteg',
    accent: 'gold',
    description: 'Vikt, mål, achievements och rapporter',
    icon: '◎',
    title: 'Framsteg',
  },
  {
    id: 'mat',
    accent: 'magenta',
    description: 'Mat, måltider och matscanning',
    icon: '+',
    title: 'Mat',
  },
  {
    id: 'ai-coach',
    accent: 'cyan',
    description: 'Fullständig AI Coach',
    icon: '✦',
    title: 'AI Coach',
  },
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
  'ai-coach': 'ai-coach',
  'app-section-coach': 'ai-coach',
  'app-section-nutrition': 'mat',
  'app-section-progress': 'mal-framsteg',
  'arkiv-historik': 'arkiv-historik',
  'backup-historik': 'arkiv-historik',
  'body-analysis': 'mal-framsteg',
  'cloud-sync': 'sakerhet-backup',
  'dagliga-paminnelser': 'mal-framsteg',
  'data-export': 'import-export',
  'data-import': 'import-export',
  framstegsbilder: 'mal-framsteg',
  installningar: 'installningar',
  mat: 'mat',
  'mal-framsteg': 'mal-framsteg',
  'mal-framsteg-oversikt': 'mal-framsteg',
  molnbackup: 'sakerhet-backup',
  molnstatus: 'sakerhet-backup',
  'notification-center': 'mal-framsteg',
  'nutrition-scanner-v2': 'mat',
  'progress-insights': 'mal-framsteg',
  'quiet-hours': 'mal-framsteg',
  rapportcenter: 'mal-framsteg',
  'reminder-center': 'mal-framsteg',
  sakerhet: 'sakerhet-backup',
  scanner: 'mat',
  vikt: 'mal-framsteg',
}

export function resolveMoreFolderFromTarget(targetId) {
  const id = String(targetId || '').replace(/^#/, '')
  if (!id || id === 'app-section-more' || id === 'more') return null
  if (moreHubFolders.some((folder) => folder.id === id)) return id
  return moreHubTargetFolders[id] || null
}
