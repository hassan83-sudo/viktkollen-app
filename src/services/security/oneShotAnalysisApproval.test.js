import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createAnalysisApprovalKey,
  createOneShotAnalysisApproval,
} from './oneShotAnalysisApproval.js'

function file(name, size, lastModified = 1) {
  return { lastModified, name, size, type: 'image/jpeg' }
}

function blobFile(name, lastModified = 1) {
  return new File(['x'], name, { lastModified, type: 'image/jpeg' })
}

describe('one-shot analysis approval', () => {
  it('body: without fresh approval no consent-token request or remote analysis is authorized', () => {
    const approval = createOneShotAnalysisApproval()
    const key = createAnalysisApprovalKey([
      { label: 'front', source: file('front.jpg', 100) },
      { label: 'side', source: file('side.jpg', 101) },
      { label: 'back', source: file('back.jpg', 102) },
    ])

    expect(approval.consume(key)).toBe(false)
  })

  it('body: one approval can be used for exactly one analysis attempt', () => {
    const approval = createOneShotAnalysisApproval()
    const key = createAnalysisApprovalKey([
      { label: 'front', source: file('front.jpg', 100) },
      { label: 'side', source: file('side.jpg', 101) },
      { label: 'back', source: file('back.jpg', 102) },
    ])

    approval.approve(key)

    expect(approval.consume(key)).toBe(true)
    expect(approval.consume(key)).toBe(false)
  })

  it('body: next analysis requires a new explicit approval', () => {
    const approval = createOneShotAnalysisApproval()
    const key = createAnalysisApprovalKey([
      { label: 'front', source: file('front.jpg', 100) },
      { label: 'side', source: file('side.jpg', 101) },
      { label: 'back', source: file('back.jpg', 102) },
    ])

    approval.approve(key)
    expect(approval.consume(key)).toBe(true)
    expect(approval.consume(key)).toBe(false)

    approval.approve(key)
    expect(approval.consume(key)).toBe(true)
  })

  it('nutrition: persistent stored consent is not one-shot token approval', () => {
    const approval = createOneShotAnalysisApproval()
    const storedRemoteConsent = { granted: true }
    const key = createAnalysisApprovalKey([
      { label: 'nutrition-photo', previewUrl: 'blob:meal-a', source: file('meal.jpg', 200) },
    ])

    expect(storedRemoteConsent.granted).toBe(true)
    expect(approval.consume(key)).toBe(false)
  })

  it('nutrition: explicit current approval allows exactly one remote attempt', () => {
    const approval = createOneShotAnalysisApproval()
    const key = createAnalysisApprovalKey([
      { label: 'nutrition-photo', previewUrl: 'blob:meal-a', source: file('meal.jpg', 200) },
    ])

    approval.approve(key)

    expect(approval.consume(key)).toBe(true)
    expect(approval.consume(key)).toBe(false)
  })

  it('nutrition: the next remote attempt requires a new approval', () => {
    const approval = createOneShotAnalysisApproval()
    const key = createAnalysisApprovalKey([
      { label: 'nutrition-photo', previewUrl: 'blob:meal-a', source: file('meal.jpg', 200) },
    ])

    approval.approve(key)
    expect(approval.consume(key)).toBe(true)

    approval.approve(key)
    expect(approval.consume(key)).toBe(true)
  })

  it('image changes cannot reuse previous one-shot approval', () => {
    const approval = createOneShotAnalysisApproval()
    const originalKey = createAnalysisApprovalKey([
      { label: 'nutrition-photo', previewUrl: 'blob:meal-a', source: file('meal.jpg', 200) },
    ])
    const changedImageKey = createAnalysisApprovalKey([
      { label: 'nutrition-photo', previewUrl: 'blob:meal-b', source: file('meal.jpg', 201) },
    ])

    approval.approve(originalKey)

    expect(approval.consume(changedImageKey)).toBe(false)
    expect(approval.consume(originalKey)).toBe(false)
  })

  it('wires body and nutrition UI to consumed one-shot approval instead of persistent state', () => {
    const bodySource = readFileSync(new URL('../../components/BodyAnalysisCard.jsx', import.meta.url), 'utf8')
    const nutritionSource = readFileSync(new URL('../../components/NutritionScannerV2.jsx', import.meta.url), 'utf8')

    expect(bodySource).toContain('analysisApprovalRef.current.consume(getBodyAnalysisApprovalKey())')
    expect(bodySource).toContain('analysisApprovalRef.current.approve(getBodyAnalysisApprovalKey())')
    expect(bodySource).not.toContain('hasApprovedAnalysis')

    expect(nutritionSource).toContain('remoteAnalysisApprovalRef.current.consume(getRemoteAnalysisApprovalKey(activeImagePayload))')
    expect(nutritionSource).toContain('consentApproved: remoteConsentApprovedForAttempt')
    expect(nutritionSource).not.toContain('const hasRemoteConsent')
  })

  it('same Blob/File instance produces the same approval key', () => {
    const image = blobFile('meal.jpg')

    expect(createAnalysisApprovalKey([{ label: 'nutrition-photo', source: image }])).toBe(
      createAnalysisApprovalKey([{ label: 'nutrition-photo', source: image }]),
    )
  })

  it('two different Blob/File instances with identical name/size/type/lastModified produce different keys', () => {
    const metadata = { lastModified: 42, type: 'image/jpeg' }
    const first = new File(['x'], 'meal.jpg', metadata)
    const second = new File(['x'], 'meal.jpg', metadata)

    expect(first.name).toBe(second.name)
    expect(first.size).toBe(second.size)
    expect(first.type).toBe(second.type)
    expect(first.lastModified).toBe(second.lastModified)
    expect(createAnalysisApprovalKey([{ label: 'nutrition-photo', source: first }])).not.toBe(
      createAnalysisApprovalKey([{ label: 'nutrition-photo', source: second }]),
    )
  })

  it('body composite key changes when exactly one image instance is replaced', () => {
    const front = blobFile('front.jpg')
    const side = blobFile('side.jpg')
    const back = blobFile('back.jpg')
    const replacementFront = blobFile('front.jpg')

    const originalKey = createAnalysisApprovalKey([
      { label: 'front', source: front },
      { label: 'side', source: side },
      { label: 'back', source: back },
    ])
    const sameInstancesKey = createAnalysisApprovalKey([
      { label: 'front', source: front },
      { label: 'side', source: side },
      { label: 'back', source: back },
    ])
    const swappedFrontKey = createAnalysisApprovalKey([
      { label: 'front', source: replacementFront },
      { label: 'side', source: side },
      { label: 'back', source: back },
    ])

    expect(sameInstancesKey).toBe(originalKey)
    expect(swappedFrontKey).not.toBe(originalKey)
  })

  it('nutrition key changes for a new processedBlob instance even with identical metadata', () => {
    const metadata = { lastModified: 7, type: 'image/jpeg' }
    const firstBlob = new File(['meal'], 'meal.jpg', metadata)
    const secondBlob = new File(['meal'], 'meal.jpg', metadata)

    expect(firstBlob.name).toBe(secondBlob.name)
    expect(firstBlob.size).toBe(secondBlob.size)
    expect(firstBlob.type).toBe(secondBlob.type)
    expect(firstBlob.lastModified).toBe(secondBlob.lastModified)
    expect(createAnalysisApprovalKey([{ label: 'nutrition-photo', source: firstBlob }])).not.toBe(
      createAnalysisApprovalKey([{ label: 'nutrition-photo', source: secondBlob }]),
    )
  })

  it('consume works exactly once for a matching approval', () => {
    const approval = createOneShotAnalysisApproval()
    const image = blobFile('meal.jpg')
    const key = createAnalysisApprovalKey([{ label: 'nutrition-photo', source: image }])

    approval.approve(key)

    expect(approval.consume(key)).toBe(true)
    expect(approval.consume(key)).toBe(false)
    expect(approval.has(key)).toBe(false)
  })

  it('mismatch consumes the previous approval so it cannot be reused', () => {
    const approval = createOneShotAnalysisApproval()
    const original = blobFile('meal.jpg')
    const replacement = blobFile('meal.jpg')
    const originalKey = createAnalysisApprovalKey([{ label: 'nutrition-photo', source: original }])
    const replacementKey = createAnalysisApprovalKey([{ label: 'nutrition-photo', source: replacement }])

    approval.approve(originalKey)

    expect(approval.consume(replacementKey)).toBe(false)
    expect(approval.consume(originalKey)).toBe(false)
    expect(approval.has(originalKey)).toBe(false)
  })
})
