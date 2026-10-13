import { reencodeImageFileToScanFile } from './bodyAnalysisVideoScan.js'

const order = ['front', 'side', 'back']

let state = emptyState()
const listeners = new Set()
let cameraInput = null

function emptyState() {
  return {
    notice: '',
    pendingAngle: null,
    photos: { front: null, side: null, back: null },
  }
}

function emit() {
  const snapshot = readHomeBodyScanSession()
  listeners.forEach((listener) => listener(snapshot))
}

export function readHomeBodyScanSession() {
  return {
    notice: state.notice,
    pendingAngle: state.pendingAngle,
    photos: { ...state.photos },
  }
}

export function subscribeHomeBodyScanSession(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetHomeBodyScanSession() {
  state = emptyState()
  emit()
}

export function setHomeBodyScanPendingAngle(angle) {
  state = { ...state, pendingAngle: angle }
}

export function setHomeBodyScanNotice(notice) {
  state = { ...state, notice }
  emit()
}

export function saveHomeBodyScanPhoto(angle, photo) {
  const current = state.photos[angle]
  if ((current?.file || null) === (photo?.file || null)) return
  state = {
    ...state,
    notice: '',
    pendingAngle: null,
    photos: { ...state.photos, [angle]: photo },
  }
  emit()
}

export function nextHomeBodyScanAngle() {
  return state.pendingAngle || order.find((key) => !state.photos[key]) || null
}

export async function acceptHomeSystemCameraFile(file) {
  if (!file) {
    setHomeBodyScanNotice('cancelled')
    return
  }
  const angle = nextHomeBodyScanAngle()
  if (!angle) return
  try {
    const { file: reencoded, preview } = await reencodeImageFileToScanFile(file, angle)
    saveHomeBodyScanPhoto(angle, {
      file: reencoded,
      name: reencoded.name,
      preview,
    })
  } catch {
    setHomeBodyScanNotice('failed')
  }
}

export function bindHomeSystemCameraInput(node) {
  if (cameraInput?.__vkCancel) {
    cameraInput.removeEventListener('cancel', cameraInput.__vkCancel)
  }
  cameraInput = node
  if (!node) return
  const handleCancel = () => {
    if (!node.files?.length) setHomeBodyScanNotice('cancelled')
  }
  node.__vkCancel = handleCancel
  node.addEventListener('cancel', handleCancel)
}

export function openHomeSystemCamera() {
  if (!cameraInput || typeof cameraInput.click !== 'function') return false
  cameraInput.click()
  return true
}
