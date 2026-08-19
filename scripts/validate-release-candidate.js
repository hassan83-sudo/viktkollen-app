import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { assertDistContract, getSpawnTarget } from './verify-release.js'

const checks = [
  ['npm', ['run', 'validate:staging'], 'staging validator'],
  ['npm', ['run', 'lint'], 'lint'],
  ['npm', ['run', 'build'], 'production build'],
  ['npm', ['test'], 'unit tests'],
  ['npm', ['run', 'test:e2e'], 'browser e2e'],
  ['git', ['diff', '--check'], 'git diff whitespace check'],
]

function run(command, args, label) {
  console.log(`\n[release-candidate] ${label}`)
  const target = getSpawnTarget(command, args)
  const result = spawnSync(target.command, target.args, {
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[release-candidate] ${label} failed to start: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

for (const [command, args, label] of checks) {
  run(command, args, label)
}

console.log('\n[release-candidate] dist/PWA contract')
assertDistContract()
console.log('\n[release-candidate] all checks passed')
