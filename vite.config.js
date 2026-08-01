import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  const normalized = id.replace(/\\/g, '/')

  if (normalized.includes('/node_modules/react') || normalized.includes('/node_modules/react-dom')) {
    return 'react-vendor'
  }

  if (normalized.includes('/node_modules/@supabase/')) {
    return 'supabase-vendor'
  }

  if (normalized.includes('/src/services/nutrition')) {
    return 'nutrition-services'
  }

  if (
    normalized.includes('/src/services/progress') ||
    normalized.includes('/src/services/health') ||
    normalized.includes('/src/services/checkIn')
  ) {
    return 'health-progress-services'
  }

  if (normalized.includes('/src/services/sync') || normalized.includes('/src/services/cloud')) {
    return 'cloud-services'
  }

  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  plugins: [react()],
})
