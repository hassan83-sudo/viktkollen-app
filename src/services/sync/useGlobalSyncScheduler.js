import { useEffect } from 'react'
import { globalSyncScheduler } from './globalSyncScheduler.js'

export function useGlobalSyncScheduler(userId, options = {}) {
  const { onDataChanged } = options

  useEffect(() => {
    globalSyncScheduler.setOnDataChanged(onDataChanged)

    if (!userId) {
      globalSyncScheduler.stop()
      return undefined
    }

    globalSyncScheduler.start(userId)

    return () => {
      globalSyncScheduler.stop()
      globalSyncScheduler.setOnDataChanged(null)
    }
  }, [onDataChanged, userId])
}
