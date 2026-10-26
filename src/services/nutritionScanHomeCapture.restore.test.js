/* @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearHomeFoodCameraIntent,
  markHomeFoodCameraOpened,
  restorePendingHomeFoodScan,
  takePendingHomeFoodScanFile,
} from './nutritionScanHomeCapture.js'

describe('matscanning från Hem efter en omladdning', () => {
  afterEach(() => {
    takePendingHomeFoodScanFile('user-a')
    clearHomeFoodCameraIntent()
  })

  it('öppnar matscannern igen när kameran nyss öppnades från Hem', async () => {
    markHomeFoodCameraOpened('user-a')
    await expect(restorePendingHomeFoodScan('user-a')).resolves.toBe(true)
    // Gäller bara en omladdning.
    await expect(restorePendingHomeFoodScan('user-a')).resolves.toBe(false)
  })

  it('stannar på Hem när kameran avbröts', async () => {
    markHomeFoodCameraOpened('user-a')
    clearHomeFoodCameraIntent()
    await expect(restorePendingHomeFoodScan('user-a')).resolves.toBe(false)
  })

  it('stannar på Hem för ett annat konto eller en gammal avsikt', async () => {
    markHomeFoodCameraOpened('user-a')
    await expect(restorePendingHomeFoodScan('user-b')).resolves.toBe(false)
    markHomeFoodCameraOpened('user-a')
    await expect(restorePendingHomeFoodScan('user-a', Date.now() + 6 * 60 * 1000)).resolves.toBe(false)
  })
})
