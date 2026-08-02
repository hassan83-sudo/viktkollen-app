import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
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

export function getSpawnTarget(command, args, {
  env = process.env,
  nodePath = process.execPath,
  platform = process.platform,
} = {}) {
  if (command === 'npm' && env.npm_execpath) {
    return {
      args: [env.npm_execpath, ...args],
      command: nodePath,
    }
  }

  if (platform === 'win32' && command === 'npm') {
    return {
      args,
      command: 'npm.cmd',
    }
  }

  return { args, command }
}

export function run(command, args, label) {
  console.log(`\n[release] ${label}`)
  const target = getSpawnTarget(command, args)
  const result = spawnSync(target.command, target.args, {
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[release] ${label} failed to start: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

export function assertDistContract() {
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

export function writeReleaseMarker() {
  const marker = {
    at: new Date().toISOString(),
    checks: commands.map(([, , label]) => label),
    distFiles: requiredDistFiles,
    status: 'passed',
  }
  writeFileSync(join('docs', 'release-report.json'), `${JSON.stringify(marker, null, 2)}\n`)
}

export function runReleaseGate() {
  for (const [command, args, label] of commands) {
    run(command, args, label)
  }

  console.log('\n[release] dist/PWA contract')
  assertDistContract()
  writeReleaseMarker()
  console.log('\n[release] release gate passed')
}

const isDirectRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isDirectRun) {
  runReleaseGate()
}
