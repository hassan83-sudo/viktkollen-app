/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { getAnalysisHistory } from './bodyAnalysisHistory.js'
import {
  buildCloudBackupPayload,
  restoreCloudBackupPayload,
  sanitizeBackupUserData,
} from './cloudBackupSchema.js'
import { PROFILE_PHOTO_STORAGE_KEY, writeProfilePhoto } from './profilePhotoStorage.js'
import { userDataKeys } from './userDataRepository.js'
import { clearLocalViktkollenData, getLocalDeletionKeys } from './accountDeletionClient.js'

const historyKey = userDataKeys.bodyAnalysisHistory

function bodyAnalysisWithImages() {
  return {
    analyses: [
      {
        analysisNumber: 1,
        backPhoto: { name: 'back.jpg', preview: 'data:image/jpeg;base64,YmFjaw==' },
        createdAt: '2026-08-11T10:00:00.000Z',
        frontPhoto: { name: 'front.jpg', preview: 'data:image/jpeg;base64,ZnJvbnQ=' },
        result: {
          source: 'ai',
          summary: 'Stabil visuell baslinje.',
        },
        sidePhoto: { name: 'side.jpg', preview: 'data:image/jpeg;base64,c2lkZQ==' },
        updatedAt: '2026-08-11T10:00:00.000Z',
      },
    ],
    version: 1,
  }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('Cloud Backup Body Scan sanitization', () => {
  it('keeps analysis metadata but strips image previews from the backup payload', () => {
    window.localStorage.setItem(historyKey, JSON.stringify(bodyAnalysisWithImages()))

    const payload = buildCloudBackupPayload({ name: 'privacy-test', source: 'test' })
    const stored = payload.userData[historyKey]
    const serialized = JSON.stringify(payload)

    expect(stored.analyses).toHaveLength(1)
    expect(stored.analyses[0].result.summary).toBe('Stabil visuell baslinje.')
    expect(stored.analyses[0].frontPhoto).toEqual({ name: 'front.jpg' })
    expect(stored.analyses[0].sidePhoto).toEqual({ name: 'side.jpg' })
    expect(stored.analyses[0].backPhoto).toEqual({ name: 'back.jpg' })
    expect(stored.analyses[0].frontPhoto.preview).toBeUndefined()
    expect(stored.analyses[0].sidePhoto.preview).toBeUndefined()
    expect(stored.analyses[0].backPhoto.preview).toBeUndefined()
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('base64,')
    expect(payload.metadata.containsLargeLocalImages).toBe(false)

    const local = JSON.parse(window.localStorage.getItem(historyKey))
    expect(local.analyses[0].frontPhoto.preview).toContain('data:image/jpeg;base64')
  })

  it('strips previews from an incoming backup before restore', () => {
    const sanitized = sanitizeBackupUserData({
      [historyKey]: bodyAnalysisWithImages(),
      [userDataKeys.weights]: [{ date: '2026-08-11', value: 78.4 }],
    })

    expect(sanitized[historyKey].analyses[0].frontPhoto.preview).toBeUndefined()
    expect(sanitized[userDataKeys.weights][0].value).toBe(78.4)
  })

  it('restores Body Scan history without previews and without crashing local history', () => {
    const restore = restoreCloudBackupPayload({
      app: 'Viktkollen',
      schemaVersion: 2,
      userData: {
        [historyKey]: {
          analyses: [
            {
              analysisNumber: 2,
              backPhoto: { name: 'back.jpg' },
              createdAt: '2026-08-12T10:00:00.000Z',
              frontPhoto: { name: 'front.jpg' },
              result: { source: 'ai', summary: 'Återställd utan bilder.' },
              sidePhoto: { name: 'side.jpg' },
              updatedAt: '2026-08-12T10:00:00.000Z',
            },
          ],
          version: 1,
        },
      },
    })

    expect(restore.ok).toBe(true)
    const history = getAnalysisHistory()
    expect(history).toHaveLength(1)
    expect(history[0].result.summary).toBe('Återställd utan bilder.')
    expect(history[0].frontPhoto?.preview).toBeUndefined()
    expect(JSON.stringify(history)).not.toContain('data:image')
  })
})

describe('profile photo deletion without Cloud Backup', () => {
  it('clears the profile photo on local wipe and never includes it in a backup payload', () => {
    writeProfilePhoto('data:image/jpeg;base64,cHJvZmlsZQ==')
    window.localStorage.setItem(userDataKeys.weights, JSON.stringify([{ date: '2026-08-11', value: 78 }]))

    expect(getLocalDeletionKeys()).toContain(PROFILE_PHOTO_STORAGE_KEY)
    expect(window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY)).toContain('data:image')

    const payload = buildCloudBackupPayload({ source: 'test' })
    expect(payload.userData[PROFILE_PHOTO_STORAGE_KEY]).toBeUndefined()
    expect(JSON.stringify(payload.metadata.storageKeys)).not.toContain(PROFILE_PHOTO_STORAGE_KEY)

    const cleared = clearLocalViktkollenData()
    expect(cleared.removedKeys).toContain(PROFILE_PHOTO_STORAGE_KEY)
    expect(window.localStorage.getItem(PROFILE_PHOTO_STORAGE_KEY)).toBeNull()
  })
})
