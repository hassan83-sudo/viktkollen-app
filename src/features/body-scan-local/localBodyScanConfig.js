// Lokal kroppsscanning (BODY-SCAN-LOCAL-1).
//
// All bildbehandling sker i webbläsaren. Endast modell-/WASM-filer hämtas,
// och de serveras från appens egen origin (Vite-assets) - aldrig från ett CDN.
// Inga kroppsbilder, bildrutor eller masker skickas eller sparas.

export const localBodyScanFeatureId = 'localBodyScan'

export const localPoseModel = Object.freeze({
  id: 'mediapipe-pose-landmarker-lite',
  license: 'Apache-2.0',
  licenseSource: 'Google MediaPipe Model Card "BlazePose GHUM 3D" (Apache License 2.0)',
  library: '@mediapipe/tasks-vision',
  libraryLicense: 'Apache-2.0',
  // 0.10.35 valdes medvetet: 1.0.x innehåller en inbyggd telemetrisändare
  // (odml.pa.googleapis.com/v1/log) som inte kan stängas av.
  libraryVersion: '0.10.35',
  modelFile: 'pose_landmarker_lite.task',
  modelSha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
})

export const localModelVersionTag = `${localPoseModel.id}@${localPoseModel.libraryVersion}`

export const localScanViews = Object.freeze([
  {
    id: 'front',
    instruction: 'Stå rakt framifrån, hela kroppen i bild. Håll armarna en bit ut från kroppen.',
    label: 'Framifrån',
    required: true,
  },
  {
    id: 'side',
    instruction: 'Vänd vänster eller höger sida mot kameran. Lägg händerna på huvudet.',
    label: 'Från sidan',
    required: false,
  },
  {
    id: 'back',
    instruction: 'Vänd ryggen mot kameran. Håll armarna en bit ut från kroppen.',
    label: 'Bakifrån',
    required: false,
  },
])

export const maxSavedLocalScans = 60

// Betaläget är svenskt tills funktionen är verifierad och får översättningar.
export const localBodyScanTexts = Object.freeze({
  hint: 'Bilderna analyseras bara på enheten och sparas inte.',
  loading: 'Laddar lokal analys…',
  modeButton: 'Lokal (beta)',
})
