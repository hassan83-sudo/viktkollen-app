import {
  videoScanCountdownStart,
  videoScanCountdownStepMs,
} from '../../services/bodyAnalysisVideoScan.js'

export const checkMeCountdownStart = videoScanCountdownStart
export const checkMeCountdownStepMs = videoScanCountdownStepMs

export const checkMeSteps = Object.freeze([
  { id: 'front', label: 'Fram', prompt: 'Stå rakt mot kameran.', turn: null },
  { id: 'turn-right', label: 'Vänd höger →', prompt: 'Vänd dig åt höger.', turn: 'right' },
  { id: 'back', label: 'Bak', prompt: 'Vänd ryggen mot kameran.', turn: 'back' },
  { id: 'turn-left', label: 'Vänd vänster ←', prompt: 'Vänd dig åt vänster.', turn: 'left' },
])

export const checkMeVisionReady = false

export const checkMeObservationDisclaimer = 'Detta är observation/styling/grooming, inte medicinsk diagnos. Visuell AI-analys av fläckar, hår eller makeup är inte aktiv ännu. Titta själv i live-preview. Vid osäkerhet: "Det ser ut som...", "Jag ser något som kan vara...", "Kontrollera området..."'

export function getCheckMeStep(index = 0) {
  const safeIndex = Math.max(0, Math.min(checkMeSteps.length - 1, Number(index) || 0))
  return {
    index: safeIndex,
    isLast: safeIndex === checkMeSteps.length - 1,
    step: checkMeSteps[safeIndex],
    total: checkMeSteps.length,
  }
}

export function getNextCheckMeIndex(index = 0) {
  const next = Number(index) + 1
  return next < checkMeSteps.length ? next : null
}
