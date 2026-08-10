const filterDays = {
  all: null,
  '30d': 30,
  '90d': 90,
  year: 365,
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function parseDate(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function safeNumber(value) {
  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

function dayDiff(first, second) {
  if (!first || !second) return 0

  return Math.max(0, Math.round(Math.abs(second - first) / 86400000))
}

function normalizePhoto(photo = {}) {
  const createdAt = parseDate(photo.createdAt || photo.date)
  const weight = safeNumber(photo.weight)

  return {
    ...photo,
    createdAtDate: createdAt,
    note: photo.note || 'Ingen anteckning',
    weight,
    weightLabel: photo.weightLabel || (weight === null ? 'Vikt saknas' : `${weight.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} kg`),
  }
}

export function filterProgressPhotos(photos = [], filter = 'all', now = new Date()) {
  const days = filterDays[filter] ?? null
  const normalized = safeArray(photos).map(normalizePhoto)

  if (!days) {
    return normalized
  }

  const end = parseDate(now) || new Date()
  const cutoff = new Date(end)

  cutoff.setDate(cutoff.getDate() - days)

  return normalized.filter((photo) => photo.createdAtDate && photo.createdAtDate >= cutoff)
}

export function sortProgressPhotosChronologically(photos = []) {
  return safeArray(photos)
    .map(normalizePhoto)
    .sort((first, second) => {
      const firstTime = first.createdAtDate?.getTime() || 0
      const secondTime = second.createdAtDate?.getTime() || 0

      return firstTime - secondTime || String(first.id).localeCompare(String(second.id), 'sv-SE')
    })
}

export function buildProgressPhotoComparison({ afterPhotoId, beforePhotoId, photos = [] } = {}) {
  const normalized = safeArray(photos).map(normalizePhoto)
  const chronological = sortProgressPhotosChronologically(normalized)
  const before = normalized.find((photo) => String(photo.id) === String(beforePhotoId)) || chronological[0] || null
  const after = normalized.find((photo) => String(photo.id) === String(afterPhotoId)) || chronological.at(-1) || null
  const weightChange = before?.weight !== null &&
    before?.weight !== undefined &&
    after?.weight !== null &&
    after?.weight !== undefined
    ? Number((after.weight - before.weight).toFixed(1))
    : null

  return {
    after,
    before,
    daysBetween: before?.createdAtDate && after?.createdAtDate
      ? dayDiff(before.createdAtDate, after.createdAtDate)
      : 0,
    hasBoth: Boolean(before && after),
    weightChange,
    weightChangeLabel: weightChange === null
      ? 'Viktförändring saknas'
      : `${weightChange > 0 ? '+' : ''}${weightChange.toLocaleString('sv-SE', {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      }).replace('−', '-')} kg`,
  }
}

export function buildProgressPhotoInsights(photos = [], comparison = {}) {
  const chronological = sortProgressPhotosChronologically(photos)
  const first = chronological[0]
  const latest = chronological.at(-1)
  const daysBetween = first?.createdAtDate && latest?.createdAtDate
    ? dayDiff(first.createdAtDate, latest.createdAtDate)
    : 0

  return {
    photoCount: chronological.length,
    periodDays: daysBetween,
    periodLabel: chronological.length >= 2 ? `${daysBetween} dagar` : 'För lite historik',
    selectedWeightChangeLabel: comparison.weightChangeLabel || 'Viktförändring saknas',
  }
}

export const progressPhotoFilters = [
  { id: 'all', label: 'Alla' },
  { id: '30d', label: 'Senaste 30 dagar' },
  { id: '90d', label: 'Senaste 90 dagar' },
  { id: 'year', label: 'Senaste året' },
]
