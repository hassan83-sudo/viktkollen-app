import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name).replaceAll('\\', '/')])
}
export function wardrobeInventory() {
  const sourceFiles = [...files('api'), ...files('src')].filter((path) => /\.(js|jsx)$/.test(path) && !/\.test\./.test(path))
  return {
    deployable: sourceFiles.filter((path) => path.startsWith('api/') && !path.includes('/_')),
    rewrites: JSON.parse(readFileSync('vercel.json', 'utf8')).rewrites,
    externalCallSites: sourceFiles.flatMap((path) => readFileSync(path, 'utf8').split('\n').flatMap((line, index) => /\bfetch(?:Impl|ProviderJson)?\(|\bcreateClient\(|new (?:Client|Pool|WebSocket)\(/.test(line) ? [{ path, line: index + 1, operation: line.match(/\b(fetch(?:Impl|ProviderJson)?|createClient|Client|Pool|WebSocket)\(/)?.[1] }] : [])),
  }
}
if (process.argv.includes('--write')) {
  writeFileSync('docs/wardrobe-isolation-inventory.json', `${JSON.stringify(wardrobeInventory(), null, 2)}\n`)
}
