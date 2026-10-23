import process from 'node:process'
import { Buffer } from 'node:buffer'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

function manualChunks(id) {
  const normalized = id.replace(/\\/g, '/')

  if (normalized.includes('/node_modules/react') || normalized.includes('/node_modules/react-dom')) {
    return 'react-vendor'
  }

  if (normalized.includes('/node_modules/@supabase/')) {
    return 'supabase-vendor'
  }

  if (
    normalized.includes('/src/services/nutrition/mealCorrections.js') ||
    normalized.includes('/src/services/nutrition/nutritionGoals.js')
  ) {
    return 'nutrition-core-services'
  }

  return undefined
}

function hasServerEnvValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
}

export function loadServerOnlyDevEnv(mode, envLoader = loadEnv) {
  const env = envLoader(mode, process.cwd(), '')
  const serverKeys = [
    'OPENAI_API_KEY',
    'OPENAI_COACH_MODEL',
    'VOICE_AI_MODEL',
    'VOICE_IDLE_TIMEOUT_MS',
    'VOICE_MAX_SESSION_MS',
    'NUTRITION_PHOTO_MODEL',
    'OPENAI_MODEL',
    'OPENAI_PHOTO_MODEL',
    'NUTRITION_PHOTO_MAX_FILE_BYTES',
    'NUTRITION_PHOTO_TIMEOUT_MS',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ]

  serverKeys.forEach((key) => {
    if (!hasServerEnvValue(process.env[key]) && hasServerEnvValue(env[key])) {
      process.env[key] = env[key]
    }
  })

  return {
    modelConfigured: true,
    openAiKeyPresent: hasServerEnvValue(process.env.OPENAI_API_KEY),
    providerConfigured: hasServerEnvValue(process.env.OPENAI_API_KEY),
    providerName: 'openai',
  }
}

function withVercelResponseHelpers(response) {
  if (typeof response.status !== 'function') {
    response.status = (statusCode) => {
      response.statusCode = statusCode
      return response
    }
  }

  if (typeof response.json !== 'function') {
    response.json = (payload) => {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
      }
      response.end(JSON.stringify(payload))
      return response
    }
  }

  return response
}

async function readDevRequestBody(request) {
  if (typeof request.body === 'string' || (request.body && typeof request.body === 'object')) {
    return request.body
  }

  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

function legacyAiApiDevMiddleware() {
  return {
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ai', async (request, response) => {
        try {
          request.body = await readDevRequestBody(request)
          const route = await import('./api/ai/index.js')
          await route.default(request, withVercelResponseHelpers(response))
        } catch {
          if (!response.headersSent) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          response.end(JSON.stringify({
            error: {
              code: 'DEV_API_ROUTE_FAILED',
              retryable: true,
              safeMessage: 'Lokal dev-server kunde inte köra AI-coachen.',
            },
            ok: false,
          }))
        }
      })
    },
    name: 'viktkollen-legacy-ai-api-dev-middleware',
  }
}

function nutritionPhotoApiDevMiddleware() {
  return {
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/nutrition-photo-analysis', async (request, response) => {
        const logDevRoute = (event, details = {}) => {
          if (process.env.NODE_ENV === 'production') return
          console.info('[Viktkollen dev api]', {
            event,
            ...details,
          })
        }

        try {
          logDevRoute('nutrition-photo-route-entered', {
            authPresent: Boolean(request.headers.authorization),
            contentTypePresent: Boolean(request.headers['content-type']),
            method: request.method,
            modelConfigured: true,
            openAiKeyPresent: hasServerEnvValue(process.env.OPENAI_API_KEY),
            providerConfigured: hasServerEnvValue(process.env.OPENAI_API_KEY),
            providerName: 'openai',
          })
          const route = await import('./api/nutrition-photo-analysis/index.js')
          await route.default(request, withVercelResponseHelpers(response))
          logDevRoute('nutrition-photo-route-completed', {
            headersSent: response.headersSent === true,
            statusCode: response.statusCode,
          })
        } catch {
          if (!response.headersSent) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
          }
          response.end(JSON.stringify({
            error: {
              code: 'DEV_API_ROUTE_FAILED',
              retryable: true,
              safeMessage: 'Lokal dev-server kunde inte köra remote bildanalys-routen.',
            },
            ok: false,
          }))
        }
      })
    },
    name: 'viktkollen-nutrition-photo-api-dev-middleware',
  }
}

// Preview-only testsida för lokal kroppsscanning (BODY-SCAN-LOCAL-3).
// Byggs bara i Vercel Preview eller lokalt utanför Vercel – aldrig i
// Vercel Production. Sidan har dessutom en egen värdnamnsspärr i webbläsaren.
export function shouldBuildBodyScanPreview(env = process.env) {
  if (env.VERCEL_ENV === 'preview') return true
  return !env.VERCEL && env.VERCEL_ENV === undefined
}

// Dedicated installations use separate Vercel projects/hostnames and build identities.
// The public Viktkollen build remains byte-for-byte unchanged when no variant is set.
function separatePwaIdentity() {
  const variant = process.env.VITE_APP_VARIANT || 'production'
  if (!['production', 'admin', 'test'].includes(variant)) {
    throw new Error('invalid_pwa_variant')
  }
  if (variant === 'test' && process.env.VERCEL) {
    const url = process.env.VITE_SUPABASE_URL || ''
    if (process.env.VERCEL_ENV !== 'preview' ||
        !/^https:\/\/armtslzspuebmlysnooq\.supabase\.co\/?$/.test(url)) {
      throw new Error('test_pwa_requires_staging_preview')
    }
  }
  return {
    name: 'separate-pwa-identity',
    transformIndexHtml(html) {
      if (variant === 'production') return html
      const name = variant === 'admin' ? 'Viktkollen Admin' : 'Viktkollen Test'
      return html
        .replace('href="/manifest.webmanifest"', `href="/manifest-${variant}.webmanifest"`)
        .replace('href="/pwa-icon-192.png"', `href="/pwa-${variant}.svg"`)
        .replace('href="/favicon.svg"', `href="/pwa-${variant}.svg"`)
        .replace('<title>Viktkollen</title>', `<title>${name}</title>`)
        .replace('content="Viktkollen" />', `content="${name}" />`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadServerOnlyDevEnv(mode)
  const bodyScanPreview = shouldBuildBodyScanPreview()

  return {
    build: {
      rollupOptions: {
        ...(bodyScanPreview
          ? {
              input: {
                bodyScanPreview: new URL('./body-scan-preview.html', import.meta.url).pathname,
                main: new URL('./index.html', import.meta.url).pathname,
              },
            }
          : {}),
        output: {
          manualChunks,
        },
      },
    },
    define: {
      __VK_BODY_SCAN_PREVIEW__: JSON.stringify(bodyScanPreview),
    },
    plugins: [separatePwaIdentity(), react(), basicSsl(), legacyAiApiDevMiddleware(), nutritionPhotoApiDevMiddleware()],
    server: {
      allowedHosts: true,
      host: true,
    },
    test: {
      exclude: ['dist/**', 'node_modules/**', 'tests/e2e/**', 'tests/a11y/**', 'tests/ai-help/**'],
      setupFiles: ['./src/test/setup.js'],
    },
  }
})
