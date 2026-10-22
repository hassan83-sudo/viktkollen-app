import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config.js'

export default mergeConfig(base({ mode: 'test', command: 'serve' }), defineConfig({
  test: {
    setupFiles: ['./src/test/wardrobeOfflineNetworkSetup.js'],
    include: [
      'api/**/*.test.js',
      'src/services/supabaseClient.wardrobe.test.js',
      'src/services/wardrobeStorage.test.js',
      'src/services/wardrobePhoto.test.js',
      'src/features/smart-camera/components/OutfitWardrobeSelection.test.jsx',
      'src/features/smart-camera/components/WardrobeGarmentForm.test.jsx',
    ],
  },
}))
