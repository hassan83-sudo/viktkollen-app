export const exportMimeTypes = Object.freeze({
  csv: 'text/csv;charset=utf-8',
  json: 'application/json;charset=utf-8',
  text: 'text/plain;charset=utf-8',
})

let downloadRunning = false

export function sanitizeExportFilename(value, extension = 'json') {
  const safeBase = String(value || 'viktkollen-export')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
    .replace(/\.+/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 90) || 'viktkollen-export'
  const safeExtension = String(extension || 'json').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'json'

  return safeBase.endsWith(`.${safeExtension}`) ? safeBase : `${safeBase}.${safeExtension}`
}

export function createBrowserDownloadAdapter(win = window, doc = document) {
  return function downloadBlob({ filename, text, type }) {
    if (downloadRunning) return { ok: false, reason: 'En nedladdning pågår redan.' }
    downloadRunning = true

    let url = ''
    try {
      const blob = new Blob([text], { type })
      url = win.URL.createObjectURL(blob)
      const link = doc.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      return { ok: true, reason: 'Exportfilen skapades.', size: blob.size }
    } catch {
      return { ok: false, reason: 'Exportfilen kunde inte skapas.' }
    } finally {
      if (url) win.URL.revokeObjectURL(url)
      downloadRunning = false
    }
  }
}

export function downloadExportDraft(draft, options = {}, adapter = createBrowserDownloadAdapter()) {
  if (!draft?.payloadText) {
    return { ok: false, reason: 'Exporten är inte redo för nedladdning.' }
  }

  if (options.expectedUserId && options.currentUserId && options.expectedUserId !== options.currentUserId) {
    return { ok: false, reason: 'Användaren ändrades innan exporten kunde laddas ned.' }
  }

  return adapter({
    filename: draft.filename,
    text: draft.payloadText,
    type: draft.mimeType,
  })
}
