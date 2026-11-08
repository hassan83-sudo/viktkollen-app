export const wardrobeStorageKey = 'viktkollen.notice.wardrobe.v1'
export const wardrobeChangedEvent = 'viktkollen:wardrobe-changed'
export const garmentTypes = ['Tröja', 'Skjorta', 'Byxor', 'Jeans', 'Jacka', 'Klänning', 'Skor', 'Accessoar', 'Annat']
const empty = () => ({ garments: [], worn: [], outfits: [], selectedGarmentIds: [] })
export const isWardrobePhoto = (value) => typeof value === 'string' && value.length <= 200000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)

export function readWardrobe() {
  if (typeof window === 'undefined') return empty()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(wardrobeStorageKey) || '{}')
    return {
      ...parsed,
      garments: Array.isArray(parsed.garments) ? parsed.garments.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string').map((g) => ({ ...g, image: isWardrobePhoto(g.image) ? g.image : '' })) : [],
      worn: Array.isArray(parsed.worn) ? parsed.worn.filter((w) => w && typeof w.date === 'string' && Array.isArray(w.garmentIds)) : [],
      outfits: Array.isArray(parsed.outfits) ? parsed.outfits.filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.garmentIds)) : [],
      selectedGarmentIds: Array.isArray(parsed.selectedGarmentIds) ? [...new Set(parsed.selectedGarmentIds.filter((id) => typeof id === 'string'))] : [],
    }
  } catch {
    return empty()
  }
}

export function updateWardrobe(change) {
  const next = change(readWardrobe())
  const serialized = JSON.stringify(next)
  if (serialized.length > 2500000) throw new Error('wardrobe_full')
  window.localStorage.setItem(wardrobeStorageKey, serialized)
  window.dispatchEvent(new Event(wardrobeChangedEvent))
  return next
}

export function garmentSlot(type) {
  if (['Byxor', 'Jeans'].includes(type)) return 'bottom'
  if (type === 'Skor') return 'shoes'
  if (type === 'Jacka') return 'outer'
  if (type === 'Klänning') return 'dress'
  if (['Accessoar', 'Annat'].includes(type)) return 'accessory'
  return 'top'
}

export function removeWardrobeGarment(id) {
  return updateWardrobe((s) => ({
    ...s,
    garments: s.garments.filter((g) => g.id !== id),
    selectedGarmentIds: s.selectedGarmentIds.filter((value) => value !== id),
    outfits: s.outfits.map((o) => ({ ...o, garmentIds: o.garmentIds.filter((value) => value !== id) })),
    worn: s.worn.map((w) => ({ ...w, garmentIds: (w.garmentIds || []).filter((value) => value !== id) })),
  }))
}

export function markWardrobeWorn(ids) {
  return updateWardrobe((s) => {
    const date = new Date().toLocaleDateString('sv-SE')
    const valid = new Set(s.garments.map((g) => g.id))
    const old = s.worn.find((w) => w.date === date)
    const garmentIds = [...new Set([...(old?.garmentIds || []), ...ids])].filter((id) => valid.has(id))
    return { ...s, worn: [{ date, garmentIds, updatedAt: new Date().toISOString() }, ...s.worn.filter((w) => w.date !== date)].slice(0, 30) }
  })
}
