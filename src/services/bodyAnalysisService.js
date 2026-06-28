const mockBodyResult = {
  bodyFat: '~24 %',
  muscleMass: 'Normal',
  posture: 'Bra',
  waistTrend: 'Följs över tid',
}

export function analyzeBodyWithAI({ frontPhoto, sidePhoto }) {
  if (!frontPhoto) {
    throw new Error('Bild framifrån saknas. Välj en bild och försök igen.')
  }

  if (!sidePhoto) {
    throw new Error('Bild från sidan saknas. Välj en bild och försök igen.')
  }

  // TODO: Replace this mock with a backend API request for body analysis.
  // TODO: Send the selected front-facing image as one parameter.
  // TODO: Send the selected side-facing image as one parameter.
  // TODO: Return the AI result from the backend instead of the mock result.
  return mockBodyResult
}
