import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'

const requiredDistFiles = [
  'dist/manifest.webmanifest',
  'dist/sw.js',
  'dist/pwa-icon-192.png',
  'dist/pwa-icon-512.png',
  'dist/pwa-maskable-512.png',
]

const commands = [
  ['npm', ['test', '--', '--run'], 'unit test run 1'],
  ['npm', ['test', '--', '--run'], 'unit test run 2'],
  ['npm', ['run', 'lint'], 'lint'],
  ['npm', ['run', 'build'], 'production build'],
  ['npm', ['run', 'test:e2e'], 'browser e2e'],
  ['git', ['diff', '--check'], 'git diff whitespace check'],
]

function run(command, args, label) {
  console.log(`\n[release] ${label}`)
  const result = spawnSync(command, args, {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function assertDistContract() {
  requiredDistFiles.forEach((file) => {
    if (!existsSync(file)) {
      throw new Error(`Missing release artifact: ${file}`)
    }
  })

  const indexHtml = readFileSync('dist/index.html', 'utf8')
  const forbiddenPreloads = ['ReminderCenter', 'LaunchReadinessPanel', 'CloudBackupPanel', 'ReportDrilldown']
  const badPreload = forbiddenPreloads.find((name) => indexHtml.includes(name))
  if (badPreload) {
    throw new Error(`Lazy chunk was modulepreloaded unexpectedly: ${badPreload}`)
  }
}

function writeReleaseMarker() {
  const marker = {
    at: new Date().toISOString(),
    checks: commands.map(([, , label]) => label),
    distFiles: requiredDistFiles,
    status: 'passed',
  }
  writeFileSync(join('docs', 'release-report.json'), `${JSON.stringify(marker, null, 2)}\n`)
}

for (const [command, args, label] of commands) {
  run(command, args, label)
}

console.log('\n[release] dist/PWA contract')
assertDistContract()
writeReleaseMarker()
console.log('\n[release] release gate passed')
