export const wardrobeStorageKey = 'viktkollen.notice.wardrobe.v1'

export function readWardrobe() {
  if (typeof window === 'undefined') return { garments: [], worn: [] }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(wardrobeStorageKey) || '{}')
    return {
      garments: Array.isArray(parsed.garments) ? parsed.garments : [],
      worn: Array.isArray(parsed.worn) ? parsed.worn : [],
    }
  } catch {
    return { garments: [], worn: [] }
  }
}
