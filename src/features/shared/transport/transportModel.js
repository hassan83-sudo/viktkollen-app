export const transportTypes = Object.freeze(['walk', 'bike', 'car', 'bus', 'train', 'flight'])

export const transportTypeLabels = Object.freeze({
  bike: 'Cykel',
  bus: 'Buss',
  car: 'Bil',
  flight: 'Flyg',
  train: 'Tåg',
  walk: 'Gång',
})

export function createTransportGuess({ confidence = 0, type = null } = {}) {
  const safeConfidence = Number.isFinite(Number(confidence))
    ? Math.max(0, Math.min(1, Number(confidence)))
    : 0
  const knownType = transportTypes.includes(type) ? type : null

  return {
    available: false,
    confidence: safeConfidence,
    label: knownType ? transportTypeLabels[knownType] : '',
    needsUserCorrection: true,
    reason: 'Automatisk transportdetektion kräver native rörelsedata som inte finns i V1.',
    type: knownType,
  }
}
