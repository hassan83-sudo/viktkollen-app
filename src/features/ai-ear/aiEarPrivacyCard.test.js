import { describe, expect, it } from 'vitest'

import { getSmartCameraPrivacyLayers } from '../shared/privacy/privacyLayers.js'

describe('Smart kamera privacy card in AI-örat mode', () => {
  it('says that audio is sent on tap, is not saved, and that the camera is unused', () => {
    const layers = getSmartCameraPrivacyLayers({ audioToServer: true })

    expect(layers.aiReceives.items.join(' ')).toMatch(/Ljudet du väljer att analysera skickas till Viktkollens server/)
    expect(layers.aiReceives.items.join(' ')).toMatch(/när du trycker på analysera-knappen/)
    expect(layers.aiReceives.items.join(' ')).toMatch(/extern tjänst som anges innan du skickar/)
    expect(layers.aiReceives.localOnly).toBe(false)
    expect(layers.cameraSees.items).toEqual(['Kameran används inte i det här läget.'])
    expect(layers.saved.items.join(' ')).toMatch(/Ljudet sparas inte/)
  })

  it('never claims the camera or AI is "local" for audio, and leaves the other modes unchanged', () => {
    expect(getSmartCameraPrivacyLayers({ audioToServer: true }).aiReceives.items.join(' ')).not.toMatch(/ingen kamerabild i det här läget/i)
    const other = getSmartCameraPrivacyLayers({})
    expect(other.aiReceives.items).toEqual(['AI får ingen kamerabild i det här läget.'])
    expect(other.aiReceives.localOnly).toBe(true)
    expect(other.cameraSees.items).toEqual(['Kameran är inte igång.'])
  })
})
