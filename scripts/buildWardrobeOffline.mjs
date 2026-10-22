import { spawnSync } from 'node:child_process'
import { wardrobeIsolationFixtures } from './wardrobeIsolationFixtures.mjs'

// Process-local synthetic values; never writes .env or changes Vercel settings.
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.tmp/wardrobe-offline-dist'], {
  env: { ...process.env, ...wardrobeIsolationFixtures }, stdio: 'inherit',
})
process.exit(result.status ?? 1)
