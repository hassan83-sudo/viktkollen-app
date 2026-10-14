import { reencodeImageFileToScanFile } from './bodyAnalysisVideoScan.js'

const order = ['front', 'side']
const preferredAngleKey = 'viktkollen.bodyScan.preferredAngle'

export function getPreferredBodyScanAngle() {
  try {
    const value = window.localStorage.getItem(preferredAngleKey)
    return order.includes(value) ? value : null
  } catch {
    return null
  }
}

export function setPreferredBodyScanAngle(angle) {
  if (!order.includes(angle)) return
  try { window.localStorage.setItem(preferredAngleKey, angle) } catch { /* storage may be unavailable */ }
}


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

export async function acceptHomeSystemCameraFile(file, angle) {
  if (!file) {
    setHomeBodyScanNotice('cancelled')
    return
  }
  const target = order.includes(angle) ? angle : nextHomeBodyScanAngle()
  if (!target) return
  try {
    const { file: reencoded, preview } = await reencodeImageFileToScanFile(file, target)
    saveHomeBodyScanPhoto(target, {
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

export function openHomeSystemCamera(angle = getPreferredBodyScanAngle()) {
  if (!order.includes(angle)) return false
  setHomeBodyScanPendingAngle(angle)
  if (!cameraInput || typeof cameraInput.click !== 'function') return false
  cameraInput.click()
  return true
}
