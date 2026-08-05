import { PWA_APP_VERSION, PWA_CACHE_VERSION } from '../registerServiceWorker.js'
import { getBackupStorageKeys } from './userDataRepository.js'
import { getSharedAnalyticsCacheStats } from './sharedAnalyticsCache.js'

const storageBands = [
  [0, 'tom'],
  [10_000, 'liten'],
  [100_000, 'medel'],
  [500_000, 'stor'],
  [Number.POSITIVE_INFINITY, 'mycket stor'],
]

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function sizeBand(bytes) {
  return storageBands.find(([limit]) => bytes <= limit)?.[1] || 'okänd'
}

function storageSize(storage, key) {
  try {
    return String(storage?.getItem?.(key) || '').length
  } catch {
    return 0
  }
}

export function buildStoragePressureSummary({
  keys = getBackupStorageKeys(),
  storage = typeof window !== 'undefined' ? window.localStorage : null,
} = {}) {
  const entries = safeArray(keys).map((key) => {
    const bytes = storageSize(storage, key)
    return {
      band: sizeBand(bytes),
      key,
    }
  })

  return {
    entries,
    largestBands: entries
      .slice()
      .sort((first, second) => storageBands.findIndex(([, band]) => band === second.band) - storageBands.findIndex(([, band]) => band === first.band))
      .slice(0, 5),
    totalBand: sizeBand(entries.reduce((sum, entry) => {
      const approx = storageBands.find((bandEntry) => bandEntry[1] === entry.band)?.[0] || 0
      return sum + approx
    }, 0)),
  }
}

export function buildRuntimePerformanceSummary({
  lazyChunkCount = 0,
  largestLazyChunks = [],
  listenerCategories = [],
  schedulerTypes = [],
  storage,
  windowRef = typeof window !== 'undefined' ? window : null,
  documentRef = typeof document !== 'undefined' ? document : null,
} = {}) {
  return {
    analyticsCache: getSharedAnalyticsCacheStats(),
    appVersion: PWA_APP_VERSION,
    cacheVersion: PWA_CACHE_VERSION,
    largestLazyChunks: safeArray(largestLazyChunks).slice(0, 5),
    lazyChunkCount,
    listenerCategories: safeArray(listenerCategories).slice(0, 10),
    online: windowRef?.navigator?.onLine !== false,
    schedulerTypes: safeArray(schedulerTypes).slice(0, 10),
    storagePressure: buildStoragePressureSummary({ storage }),
    visibility: documentRef?.visibilityState || 'unknown',
  }
}
