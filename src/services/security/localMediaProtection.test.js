/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { createRemoteSyncPayload } from '../sync/cloudSyncEngine.js'
import { buildCloudBackupPayload } from '../cloudBackupSchema.js'
import { buildDataExportDraft } from '../export/dataExportEngine.js'
import { getAnalysisHistory } from '../bodyAnalysisHistory.js'
import { PROFILE_PHOTO_STORAGE_KEY, writeProfilePhoto } from '../profilePhotoStorage.js'
import { getProgressPhotos, saveProgressPhotos, userDataKeys } from '../userDataRepository.js'

const progressPhotoFixture = [
  {
    createdAt: '2026-08-20T08:00:00.000Z',
    id: 1755676800000,
    image: 'data:image/jpeg;base64,cHJvZ3Jlc3M=',
    note: 'Vecka 12',
    view: 'front',
    weight: 81.2,
  },
]

const bodyAnalysisFixture = {
  analyses: [
    {
      analysisNumber: 1,
      backPhoto: { name: 'back.jpg', preview: 'data:image/jpeg;base64,YmFjaw==' },
      createdAt: '2026-08-11T10:00:00.000Z',
      frontPhoto: { name: 'front.jpg', preview: 'data:image/jpeg;base64,ZnJvbnQ=' },
      result: { source: 'ai', summary: 'Stabil visuell baslinje.' },
      sidePhoto: { name: 'side.jpg', preview: 'data:image/jpeg;base64,c2lkZQ==' },
      updatedAt: '2026-08-11T10:00:00.000Z',
    },
  ],
  version: 1,
}

afterEach(() => {
  window.localStorage.clear()
})

describe('progress photos never leave the device automatically', () => {
  it('stores progress photos locally with full image data intact', () => {
    saveProgressPhotos(progressPhotoFixture)

    const local = getProgressPhotos()
    expect(local).toHaveLength(1)
    expect(local[0].image).toBe(progressPhotoFixture[0].image)
  })

  it('produces a sync payload for the progress photos key with the image stripped', () => {
    saveProgressPhotos(progressPhotoFixture)

    const record = {
      checksum: 'irrelevant',
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      deleted: false,
      payload: progressPhotoFixture,
      storageKey: userDataKeys.progressPhotos,
    }
    const remotePayload = createRemoteSyncPayload(record, 'user-1', 'device-1')
    const serialized = JSON.stringify(remotePayload)

    expect(remotePayload.payload[0].image).toBeNull()
    expect(remotePayload.payload[0].id).toBe(progressPhotoFixture[0].id)
    expect(remotePayload.payload[0].note).toBe('Vecka 12')
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('cHJvZ3Jlc3M=')

    // The local copy must be completely unaffected by building the upload payload.
    const local = getProgressPhotos()
    expect(local[0].image).toBe(progressPhotoFixture[0].image)
  })

  it('excludes progress photo image bytes from the cloud backup payload', () => {
    saveProgressPhotos(progressPhotoFixture)

    const payload = buildCloudBackupPayload({ source: 'manual-push' })
    const serialized = JSON.stringify(payload)

    expect(payload.userData[userDataKeys.progressPhotos]?.[0]?.image).toBeNull()
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('cHJvZ3Jlc3M=')

    const local = getProgressPhotos()
    expect(local[0].image).toBe(progressPhotoFixture[0].image)
  })

  it('excludes progress photo image bytes from a data export payload', () => {
    saveProgressPhotos(progressPhotoFixture)

    const draft = buildDataExportDraft({ selectedSections: ['progressMetadata'] })

    expect(draft.payloadText).not.toContain('data:image')
    expect(draft.payloadText).not.toContain('cHJvZ3Jlc3M=')

    const local = getProgressPhotos()
    expect(local[0].image).toBe(progressPhotoFixture[0].image)
  })

  it('does not delete or reorder existing local progress photos when other keys are synced', () => {
    saveProgressPhotos(progressPhotoFixture)
    window.localStorage.setItem(userDataKeys.weights, JSON.stringify([{ date: '2026-08-20', value: 81.2 }]))

    createRemoteSyncPayload({
      checksum: 'c',
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      deleted: false,
      payload: JSON.parse(window.localStorage.getItem(userDataKeys.weights)),
      storageKey: userDataKeys.weights,
    }, 'user-1', 'device-1')

    const local = getProgressPhotos()
    expect(local).toEqual(progressPhotoFixture)
  })
})

describe('the profile photo never leaves the device automatically', () => {
  it('stays local and is never present in an outgoing sync payload for its own key', () => {
    writeProfilePhoto('data:image/jpeg;base64,cHJvZmlsZQ==')

    expect(window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY)).toContain('data:image')

    const remotePayload = createRemoteSyncPayload({
      checksum: 'c',
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      deleted: false,
      payload: window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY),
      storageKey: PROFILE_PHOTO_STORAGE_KEY,
    }, 'user-1', 'device-1')

    // Even if a future regression ever added this key to the sync
    // allowlist, the central media guard still strips the image content.
    expect(remotePayload.payload).toBeNull()
    expect(window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY)).toContain('data:image')
  })

  it('is excluded from the cloud backup payload entirely', () => {
    writeProfilePhoto('data:image/jpeg;base64,cHJvZmlsZQ==')

    const payload = buildCloudBackupPayload({ source: 'manual-push' })

    expect(payload.userData[PROFILE_PHOTO_STORAGE_KEY]).toBeUndefined()
    expect(window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY)).toContain('data:image')
  })
})

describe('local body scan history is never destroyed by building outgoing payloads', () => {
  it('keeps full local body analysis history after a sync payload is built', () => {
    window.localStorage.setItem(userDataKeys.bodyAnalysisHistory, JSON.stringify(bodyAnalysisFixture))

    createRemoteSyncPayload({
      checksum: 'c',
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      deleted: false,
      payload: bodyAnalysisFixture,
      storageKey: userDataKeys.bodyAnalysisHistory,
    }, 'user-1', 'device-1')

    const history = getAnalysisHistory()
    expect(history).toHaveLength(1)
    expect(history[0].frontPhoto.preview).toContain('data:image/jpeg;base64')
    expect(history[0].result.summary).toBe('Stabil visuell baslinje.')
  })

  it('keeps full local body analysis history after a backup payload is built', () => {
    window.localStorage.setItem(userDataKeys.bodyAnalysisHistory, JSON.stringify(bodyAnalysisFixture))

    buildCloudBackupPayload({ source: 'manual-push' })

    const history = getAnalysisHistory()
    expect(history).toHaveLength(1)
    expect(history[0].frontPhoto.preview).toContain('data:image/jpeg;base64')
  })

  it('keeps full local body analysis history after an export draft is built', () => {
    window.localStorage.setItem(userDataKeys.bodyAnalysisHistory, JSON.stringify(bodyAnalysisFixture))

    buildDataExportDraft({ selectedSections: ['progressMetadata'] })

    const history = getAnalysisHistory()
    expect(history).toHaveLength(1)
    expect(history[0].frontPhoto.preview).toContain('data:image/jpeg;base64')
  })
})

describe('an unknown future media field (e.g. a future Ogat camera key) is stopped automatically', () => {
  it('strips image data under a storage key and field name the guard has never seen before', () => {
    const futureRecordPayload = {
      confidence: 0.92,
      detectedAt: '2026-09-01T12:00:00.000Z',
      futureEyeRecognitionFrame: 'data:image/png;base64,ZnV0dXJlLWV5ZS1mcmFtZQ==',
      id: 'eye-1',
    }

    const remotePayload = createRemoteSyncPayload({
      checksum: 'c',
      clientUpdatedAt: new Date().toISOString(),
      dataVersion: 1,
      deleted: false,
      payload: futureRecordPayload,
      // A storage key that does not exist anywhere in this sprint's code -
      // the guard must not depend on recognising this key name at all.
      storageKey: 'viktkollen.futureEyeFeature.v1',
    }, 'user-1', 'device-1')

    expect(remotePayload.payload.futureEyeRecognitionFrame).toBeNull()
    expect(remotePayload.payload.confidence).toBe(0.92)
    expect(remotePayload.payload.id).toBe('eye-1')
    expect(JSON.stringify(remotePayload)).not.toContain('data:image')
  })
})
