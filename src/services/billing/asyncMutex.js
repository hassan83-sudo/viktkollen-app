export function createAsyncMutex() {
  const chains = new Map()

  return {
    runExclusive(key, fn) {
      const previous = chains.get(key) || Promise.resolve()
      const current = previous.catch(() => {}).then(fn)
      chains.set(key, current.catch(() => {}))
      return current
    },
  }
}
