export const portionEstimates = {
  agg: {
    pieceGrams: 60,
  },
  apple: {
    pieceGrams: 150,
  },
  avokado: {
    pieceGrams: 150,
  },
  banan: {
    pieceGrams: 120,
  },
  brod: {
    sliceGrams: 40,
  },
  broccoli: {
    defaultPortionGrams: 100,
  },
  glass: {
    deciliterGrams: 60,
  },
  'grekisk-yoghurt': {
    deciliterGrams: 100,
  },
  gurka: {
    defaultPortionGrams: 100,
  },
  hamburgare: {
    pieceGrams: 180,
  },
  havregryn: {
    deciliterGrams: 35,
  },
  keso: {
    deciliterGrams: 100,
  },
  kvarg: {
    deciliterGrams: 100,
  },
  lask: {
    deciliterGrams: 100,
  },
  majonnas: {
    tablespoonGrams: 15,
    teaspoonGrams: 5,
  },
  mjolk: {
    deciliterGrams: 100,
  },
  morotter: {
    pieceGrams: 60,
  },
  olivolja: {
    tablespoonGrams: 14,
    teaspoonGrams: 5,
  },
  ost: {
    sliceGrams: 20,
  },
  pizza: {
    smallPortionGrams: 250,
    defaultPortionGrams: 350,
    largePortionGrams: 450,
  },
  pommes: {
    smallPortionGrams: 100,
    defaultPortionGrams: 150,
    largePortionGrams: 220,
  },
  potatis: {
    pieceGrams: 80,
  },
  ris: {
    deciliterGrams: 85,
  },
  smor: {
    tablespoonGrams: 14,
    teaspoonGrams: 5,
  },
  socker: {
    tablespoonGrams: 12,
    teaspoonGrams: 4,
  },
}

export function getPortionEstimate(foodId) {
  return portionEstimates[foodId] || {}
}
