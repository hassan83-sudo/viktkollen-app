import { useEffect } from 'react'
import { globalSyncCoordinator } from './crossTabSyncCoordinator.js'

export function useGlobalSyncScheduler(userId, options = {}) {
  const { onDataChanged } = options

  useEffect(() => {
    globalSyncCoordinator.setOnDataChanged(onDataChanged)

    if (!userId) {
      globalSyncCoordinator.stop()
      return undefined
    }

    globalSyncCoordinator.start(userId)

    return () => {
      globalSyncCoordinator.stop()
      globalSyncCoordinator.setOnDataChanged(null)
    }
  }, [onDataChanged, userId])
}
