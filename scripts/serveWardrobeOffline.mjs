import { spawn } from 'node:child_process'
import { wardrobeIsolationFixtures } from './wardrobeIsolationFixtures.mjs'
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', '.tmp/wardrobe-offline-dist', '--host', '127.0.0.1', '--port', '5195', '--strictPort'], {
  env: { ...process.env, ...wardrobeIsolationFixtures }, stdio: 'inherit',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => process.exit(code ?? 1))
