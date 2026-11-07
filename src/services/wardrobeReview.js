import { garmentTypes } from './wardrobeStorage.js'

// Legacy/manual categories remain available, but AI photos are clothes/shoes only.
export const wardrobePhotoCategories = garmentTypes.filter((type) => !['Accessoar', 'Annat'].includes(type))

export const wardrobeRejectReasons = ['person', 'multiple', 'not_clothing', 'uncertain']
export function validateWardrobeReview(payload) {
  const rejected = { verdict: 'reject', reason: 'uncertain' }
  if (!payload || typeof payload !== 'object') return rejected
  if (payload.verdict === 'reject') return { verdict: 'reject', reason: wardrobeRejectReasons.includes(payload.reason) ? payload.reason : 'uncertain' }
  if (payload.verdict !== 'garment' || payload.reason !== null || payload.personPresent !== false || payload.singleItem !== true) return rejected
  if (!wardrobePhotoCategories.includes(payload.category) || !/^#[0-9a-f]{6}$/i.test(payload.colorHex || '')) return rejected
  const validText = (value, max) => typeof value === 'string' && value.trim().length >= 2 && value.length <= max && !/[<>\r\n]/.test(value) && !/https?:/i.test(value)
  if (!validText(payload.name, 60) || !validText(payload.colorName, 40)) return rejected
  return { verdict: 'garment', reason: null, personPresent: false, singleItem: true, name: payload.name.trim(), category: payload.category, colorName: payload.colorName.trim(), colorHex: payload.colorHex.toLowerCase() }
}
