import { describe, expect, it } from 'vitest'

import { sanitizeMediaPayload, sanitizeMediaPayloadMap } from './mediaSafeguard.js'

describe('sanitizeMediaPayload', () => {
  it('passes ordinary, non-media data through completely unchanged', () => {
    const value = {
      checkIn: { energy: 'bra', mood: 'glad' },
      meals: [{ calories: 450, description: 'Lunch', id: 'meal-1' }],
      settings: { theme: 'dark', notificationsEnabled: true },
      weight: 82.4,
    }

    expect(sanitizeMediaPayload(value)).toEqual(value)
  })

  it('strips a data:image URI wherever it appears, regardless of the key name', () => {
    const value = {
      date: '2026-08-30',
      id: 'progress-1',
      // A brand new, never-seen-before key name - this is exactly the
      // "unknown future media field" scenario (e.g. a future Ogat camera
      // feature) that the guard must catch without a per-feature denylist.
      futureEyeCameraFrame: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      view: 'front',
    }

    const result = sanitizeMediaPayload(value)

    expect(result.futureEyeCameraFrame).toBeNull()
    expect(result.date).toBe('2026-08-30')
    expect(result.id).toBe('progress-1')
    expect(result.view).toBe('front')
  })

  it('strips a blob: object URL', () => {
    const result = sanitizeMediaPayload({ preview: 'blob:https://app.example/1234-5678' })
    expect(result.preview).toBeNull()
  })

  it('strips any generic base64 data: URI, not just image/*', () => {
    const result = sanitizeMediaPayload({
      recognitionClip: 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQ==',
    })
    expect(result.recognitionClip).toBeNull()
  })

  it('strips a File instance', () => {
    if (typeof File === 'undefined') return
    const file = new File(['abc'], 'front.jpg', { type: 'image/jpeg' })
    const result = sanitizeMediaPayload({ frontImage: file })
    expect(result.frontImage).toBeNull()
  })

  it('strips a Blob instance', () => {
    if (typeof Blob === 'undefined') return
    const blob = new Blob(['abc'], { type: 'image/jpeg' })
    const result = sanitizeMediaPayload({ capture: blob })
    expect(result.capture).toBeNull()
  })

  it('strips raw ArrayBuffer/TypedArray camera frame bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer
    const result = sanitizeMediaPayload({ rawFrame: bytes })
    expect(result.rawFrame).toBeNull()
  })

  it('strips known image-shaped key names even when the value is a plain string', () => {
    const result = sanitizeMediaPayload({ profilePhoto: 'some-storage-reference-without-data-uri' })
    expect(result.profilePhoto).toBeNull()
  })

  it('keeps harmless metadata fields sitting next to a stripped image field', () => {
    const value = {
      date: '2026-08-30',
      id: 'progress-42',
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
      view: 'side',
    }

    const result = sanitizeMediaPayload(value)

    expect(result).toEqual({
      date: '2026-08-30',
      id: 'progress-42',
      image: null,
      view: 'side',
    })
  })

  it('recurses through nested objects and arrays of progress photo records', () => {
    const value = {
      progressPhotos: {
        front: [
          { date: '2026-08-01', id: 'p1', image: 'data:image/jpeg;base64,AAAA' },
          { date: '2026-08-15', id: 'p2', image: 'data:image/jpeg;base64,BBBB' },
        ],
      },
    }

    const result = sanitizeMediaPayload(value)

    expect(result.progressPhotos.front[0].image).toBeNull()
    expect(result.progressPhotos.front[1].image).toBeNull()
    expect(result.progressPhotos.front[0].date).toBe('2026-08-01')
    expect(result.progressPhotos.front[1].id).toBe('p2')
  })

  it('strips a body-scan record shaped exactly like the historical leak (front/side/back keys hold data URIs)', () => {
    const value = {
      photos: {
        back: 'data:image/jpeg;base64,ZZZZ',
        front: 'data:image/jpeg;base64,XXXX',
        side: 'data:image/jpeg;base64,YYYY',
      },
      summary: 'Kroppssammansättning ser stabil ut.',
    }

    const result = sanitizeMediaPayload(value)

    expect(result.photos.front).toBeNull()
    expect(result.photos.side).toBeNull()
    expect(result.photos.back).toBeNull()
    expect(result.summary).toBe('Kroppssammansättning ser stabil ut.')
  })

  it('leaves null and undefined untouched', () => {
    expect(sanitizeMediaPayload(null)).toBeNull()
    expect(sanitizeMediaPayload(undefined)).toBeUndefined()
  })

  it('is safe against pathologically deep nesting', () => {
    let value = { image: 'data:image/png;base64,AAAA' }
    for (let i = 0; i < 30; i += 1) {
      value = { nested: value }
    }
    expect(() => sanitizeMediaPayload(value)).not.toThrow()
  })

  describe('sanitizeMediaPayloadMap', () => {
    it('sanitizes every value in a {storageKey: value} map independently', () => {
      const result = sanitizeMediaPayloadMap({
        'viktkollen.checkIn': { mood: 'bra' },
        'viktkollen.progressPhotos': { front: 'data:image/jpeg;base64,AAAA' },
      })

      expect(result['viktkollen.checkIn']).toEqual({ mood: 'bra' })
      expect(result['viktkollen.progressPhotos'].front).toBeNull()
    })
  })
})
