import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'

const previewUrl = 'http://127.0.0.1:4173'
const startupTimeoutMs = 30000

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function requestPreview() {
  return new Promise((resolve, reject) => {
    const request = http.get(previewUrl, { agent: false }, (response) => {
      response.resume()
      response.on('end', () => resolve(response.statusCode >= 200 && response.statusCode < 500))
    })
    request.setTimeout(2000, () => {
      request.destroy(new Error('preview readiness timeout'))
    })
    request.on('error', reject)
  })
}

async function waitForPreview(requestPreviewImpl = requestPreview) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      if (await requestPreviewImpl()) return
    } catch (error) {
      lastError = error
    }
    await wait(250)
  }

  throw new Error(`Vite preview did not become ready at ${previewUrl}: ${lastError?.message || 'timeout'}`)
}

async function isPreviewRunning() {
  try {
    return await requestPreview()
  } catch {
    return false
  }
}

function spawnNode(args, options = {}) {
  return spawn(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
    ...options,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  })
}

function runPlaywright() {
  const result = spawnSync(process.execPath, [
    './node_modules/@playwright/test/cli.js',
    'test',
    '--reporter=list',
  ], {
    env: {
      ...process.env,
      VIKTKOLLEN_E2E_EXTERNAL_SERVER: '1',
    },
    stdio: 'inherit',
    windowsHide: true,
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Playwright failed with exit code ${result.status}`)
  }
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return Promise.resolve()

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      const timeout = setTimeout(finish, 3000)
      const clearAndFinish = () => {
        clearTimeout(timeout)
        finish()
      }
      child.once('exit', clearAndFinish)
      child.once('close', clearAndFinish)
      killer.on('exit', () => {
        if (child.exitCode !== null) clearAndFinish()
      })
      killer.on('error', clearAndFinish)
    })
  }

  child.kill('SIGTERM')
  return Promise.resolve()
}

async function main() {
  const reuseExistingPreview = await isPreviewRunning()
  const preview = reuseExistingPreview
    ? null
    : spawnNode([
        './node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4173',
        '--strictPort',
      ])

  try {
    if (!reuseExistingPreview) await waitForPreview()
    runPlaywright()
  } finally {
    await stopProcessTree(preview)
  }
}

main().then(() => {
  process.exit(0)
}).catch(async (error) => {
  console.error(`[e2e] ${error.message}`)
  process.exit(1)
})
