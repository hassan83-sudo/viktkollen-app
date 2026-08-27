import { readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = [
  'src/components/sections/ProgressSection.jsx',
  'src/components/progress/ProgressHub.jsx',
  'src/components/sections/NutritionSection.jsx',
  'src/components/sections/MoreSection.jsx',
  'src/components/more/MoreHub.jsx',
  'src/features/social/components/SocialStage.jsx',
  'src/features/social/components/HomeSocialPreview.jsx',
  'src/components/app/OverviewBodyScanStage.jsx',
  'src/components/app/OverviewFoodScanStage.jsx',
  'src/components/app/OverviewDashboard.jsx',
  'src/components/app/BottomNavigation.jsx',
  'src/components/BodyAnalysisUploader.jsx',
  'src/components/BodyAnalysisCard.jsx',
  'src/components/ProgressCenter.jsx',
  'src/components/ProgressDashboard.jsx',
  'src/components/MealLogger.jsx',
  'src/components/NutritionScannerV2.jsx',
  'src/components/LanguageSettingsPanel.jsx',
  'src/components/ReminderSettings.jsx',
  'src/components/ProfileSettings.jsx',
  'src/components/AiCoachOverlay.jsx',
  'src/components/app/OnboardingScreen.jsx',
]

// JSX text nodes / quoted Swedish UI phrases (lightweight, low false positives)
const patterns = [
  />\s*([A-ZÅÄÖ][^<{]{2,80}?)\s*</g,
  /(?:aria-label|placeholder|title)=\{?['"`]([^'"`]*[ÅÄÖåäö][^'"`]*)['"`]/g,
  /['"`]([^'"`]*[ÅÄÖåäö][^'"`]{2,100})['"`]/g,
]

const allowExact = new Set([
  'radera konto',
  'Frukost',
  'Lunch',
  'Middag',
  'Mellanmål',
  'Dryck',
  'Annat',
  'Kikärtor', // demo plate ingredient identifier
  'Rödlök', // demo plate ingredient identifier
  'Kroppsmått', // timeline type data id
  'För lite data', // progressService trend/stability enum
  'Normal variation',
  'Stor variation',
  'sv-SE',
  'Återställ', // may still appear in services
  'slå ihop', // meal import protocol token
  'ersätt', // meal import protocol token
])

const allowIncludes = [
  'useTranslation',
  't(',
  'import ',
  'from ',
  'className',
  'viktkollen',
  '.jsx',
  '.js',
  'body-scan',
  'overview-',
  'nutrition-',
  'social-',
]

function isAllowed(text, nearby) {
  const value = String(text || '').trim()
  if (!value || value.length < 3) return true
  if (allowExact.has(value)) return true
  if (allowIncludes.some((part) => nearby.includes(part) && nearby.includes('t('))) return true
  // Skip if the same line already uses t(
  if (/\bt\(/.test(nearby)) return true
  if (/^[\d\s.,:%×x+\-_/]+$/.test(value)) return true
  if (!/[ÅÄÖåäö]/.test(value) && !/\s/.test(value)) return true
  return false
}

const findings = []

for (const root of roots) {
  const absolute = path.resolve(root)
  let source
  try {
    source = await readFile(absolute, 'utf8')
  } catch {
    continue
  }

  const relative = root.replaceAll('\\', '/')
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(line)) !== null) {
        const text = match[1]
        if (isAllowed(text, line)) continue
        findings.push({
          file: relative,
          line: index + 1,
          sample: text.slice(0, 100),
        })
      }
    }
  })
}

const byFile = findings.reduce((acc, item) => {
  acc[item.file] ||= []
  acc[item.file].push(item)
  return acc
}, {})

const files = Object.keys(byFile).sort()
console.log(`Hardcoded UI debt (prioritized): ${findings.length} signals in ${files.length} files`)
files.forEach((file) => {
  console.log(`\n${file} (${byFile[file].length})`)
  byFile[file].slice(0, 12).forEach((item) => {
    console.log(`  L${item.line}: ${item.sample}`)
  })
})

if (!files.length) {
  console.log('No prioritized hardcoded UI debt signals found.')
}
