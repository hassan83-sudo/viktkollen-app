/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getLocalDeletionKeys } from '../../services/accountDeletionClient.js'
import { addAnalysis, getAnalysisHistory } from '../../services/bodyAnalysisHistory.js'
import { setActiveUserDataScope } from '../../services/userDataRepository.js'
import {
  getLegacyCleanupMarkerKey,
  inspectLegacyBodyImages,
  readLegacyCleanupMarker,
  runLegacyBodyImageCleanup,
} from './legacyBodyImageCleanup.js'

const me = { kind: 'authenticated', storageId: 'user.me', userId: 'me' }
const jpeg = (tag) => `data:image/jpeg;base64,/9j/${tag}AAAA`

const untouchedKeys = {
  // Vanliga framstegsbilder – får aldrig röras.
  'viktkollen.progressPhotos': JSON.stringify([{ createdAt: '2026-09-01', id: 1, image: jpeg('progress') }]),
  'viktkollen.profile-photo': JSON.stringify({ image: jpeg('profile') }),
  // Viktloggar (gammal global och nuvarande scoped nyckel).
  'viktkollen.weights': JSON.stringify([{ date: '2026-09-01', value: 84.2 }]),
  'viktkollen.userData.v1.user.me.weights': JSON.stringify([{ date: '2026-10-09', value: 82.7 }]),
  // En annan användares snapshot på samma enhet.
  'viktkollen.userData.v1.user.other.syncRestoreSnapshots': JSON.stringify([{
    createdAt: '2026-09-01T00:00:00.000Z',
    entries: { 'viktkollen.bodyAnalysis.history.v1': JSON.stringify({ analyses: [{ frontPhoto: { preview: jpeg('other') } }] }) },
    id: 'snap-other',
  }]),
}

function analysis(createdAt, extra = {}) {
  return {
    backPhoto: { name: 'back.jpg', preview: jpeg('back') },
    createdAt,
    frontPhoto: { name: 'front.jpg', preview: jpeg('front') },
    result: { source: 'ai', summary: `Analys ${createdAt}`, status: 'completed' },
    sidePhoto: { name: 'side.jpg', preview: `blob:https://app.example/${createdAt}` },
    status: 'Analys klar',
    userId: null,
    ...extra,
  }
}

function seedLegacyData() {
  // Exakt samma väg som det gamla Production-flödet använder.
  addAnalysis(analysis('2026-09-01T08:00:00.000Z'))
  addAnalysis(analysis('2026-09-15T08:00:00.000Z'))
  addAnalysis(analysis('2026-09-20T08:00:00.000Z', { userId: 'someone-else' }))
  window.localStorage.setItem('viktkollen.bodyAnalysis.history', JSON.stringify([analysis('2026-08-01T08:00:00.000Z')]))
  window.localStorage.setItem('viktkollen.bodyAnalysis.latest', JSON.stringify(analysis('2026-08-01T08:00:00.000Z')))
  const snapshot = (id) => JSON.stringify([{
    createdAt: '2026-09-02T00:00:00.000Z',
    entries: {
      'viktkollen.bodyAnalysis.history.v1': window.localStorage.getItem('viktkollen.bodyAnalysis.history.v1'),
      'viktkollen.weights': window.localStorage.getItem('viktkollen.weights'),
    },
    id,
    reason: 'pull',
  }])
  for (const [key, value] of Object.entries(untouchedKeys)) window.localStorage.setItem(key, value)
  window.localStorage.setItem('viktkollen.syncRestoreSnapshots', snapshot('snap-global'))
  window.localStorage.setItem('viktkollen.userData.v1.user.me.syncRestoreSnapshots', snapshot('snap-me'))
}

function dump() {
  const out = {}
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    out[key] = window.localStorage.getItem(key)
  }
  return out
}

beforeEach(() => {
  window.localStorage.clear()
  seedLegacyData()
})

afterEach(() => {
  window.localStorage.clear()
  setActiveUserDataScope({})
})

describe('rensning av gamla kroppsbilder', () => {
  it('only counts images when inspecting and never changes anything', () => {
    const before = dump()
    const status = inspectLegacyBodyImages({ scope: me })
    expect(status.imageCount).toBeGreaterThan(10)
    expect(status.skippedOtherUsers).toBeGreaterThan(0)
    expect(JSON.stringify(status)).not.toMatch(/data:image|blob:/)
    expect(dump()).toEqual(before)
  })

  it('does nothing without explicit approval', () => {
    const before = dump()
    expect(runLegacyBodyImageCleanup({ scope: me }).error).toBe('not-approved')
    expect(runLegacyBodyImageCleanup({ approved: 'yes', scope: me }).ok).toBe(false)
    expect(dump()).toEqual(before)
  })

  it('removes body image previews and keeps analysis values, weights and progress photos', () => {
    const historyBefore = getAnalysisHistory()
    const result = runLegacyBodyImageCleanup({ approved: true, scope: me })
    expect(result.ok).toBe(true)
    expect(result.removed).toBeGreaterThan(10)

    const after = dump()
    const imageCount = (key) => (after[key].match(/data:image|blob:/g) || []).length
    // Den andra användarens post (3 bildsträngar) lämnas orörd, även i snapshot-kopiorna.
    expect(imageCount('viktkollen.bodyAnalysis.history.v1')).toBe(3)
    expect(imageCount('viktkollen.syncRestoreSnapshots')).toBe(3)
    expect(imageCount('viktkollen.userData.v1.user.me.syncRestoreSnapshots')).toBe(3)
    expect(imageCount('viktkollen.bodyAnalysis.history')).toBe(0)
    expect(imageCount('viktkollen.bodyAnalysis.latest')).toBe(0)
    for (const [key, value] of Object.entries(untouchedKeys)) expect(after[key], key).toBe(value)
    // Viktloggen inne i snapshoten är också orörd.
    const snapshot = JSON.parse(after['viktkollen.syncRestoreSnapshots'])[0]
    expect(snapshot.entries['viktkollen.weights']).toBe(untouchedKeys['viktkollen.weights'])

    // Produktionens egen läsare ser samma analyser med samma värden – bara utan bilder.
    const withoutPreviews = (entry) => {
      const copy = structuredClone(entry)
      for (const photo of ['frontPhoto', 'sidePhoto', 'backPhoto']) delete copy[photo].preview
      return copy
    }
    const historyAfter = getAnalysisHistory()
    expect(historyAfter).toHaveLength(historyBefore.length)
    historyBefore.forEach((entry, index) => {
      if (entry.userId === 'someone-else') expect(historyAfter[index]).toEqual(entry)
      else expect(historyAfter[index]).toEqual(withoutPreviews(entry))
    })
    expect(historyAfter.filter((entry) => entry.userId !== 'someone-else').every((entry) => entry.frontPhoto.name === 'front.jpg' && entry.result.summary)).toBe(true)

    expect(readLegacyCleanupMarker({ scope: me })).toMatchObject({ status: 'done', version: 1 })
  })

  it('is idempotent', () => {
    runLegacyBodyImageCleanup({ approved: true, scope: me })
    const once = dump()
    const second = runLegacyBodyImageCleanup({ approved: true, scope: me })
    expect(second).toMatchObject({ ok: true, removed: 0 })
    const twice = dump()
    delete once[getLegacyCleanupMarkerKey(me)]
    delete twice[getLegacyCleanupMarkerKey(me)]
    expect(twice).toEqual(once)
    expect(inspectLegacyBodyImages({ scope: me }).imageCount).toBe(0)
  })

  it('survives an interrupted run and completes on retry', () => {
    const real = window.localStorage
    let failNext = true
    const flaky = {
      getItem: (key) => real.getItem(key),
      setItem: (key, value) => {
        if (key === 'viktkollen.bodyAnalysis.latest' && failNext) {
          failNext = false
          throw new Error('QuotaExceededError')
        }
        real.setItem(key, value)
      },
    }
    const first = runLegacyBodyImageCleanup({ approved: true, scope: me, storage: flaky })
    expect(first.ok).toBe(false)
    expect(first.failedKeys).toEqual(['viktkollen.bodyAnalysis.latest'])
    expect(readLegacyCleanupMarker({ scope: me }).status).toBe('partial')
    // Den avbrutna nyckeln är oförändrad (atomisk skrivning), inte halvskriven.
    expect(JSON.parse(real.getItem('viktkollen.bodyAnalysis.latest')).frontPhoto.preview).toMatch(/^data:image/)

    const retry = runLegacyBodyImageCleanup({ approved: true, scope: me, storage: flaky })
    expect(retry.ok).toBe(true)
    expect(inspectLegacyBodyImages({ scope: me }).imageCount).toBe(0)
  })

  it('leaves unreadable data untouched instead of guessing', () => {
    window.localStorage.setItem('viktkollen.bodyAnalysis.history', '{not json data:image/jpeg;base64,xx')
    const result = runLegacyBodyImageCleanup({ approved: true, scope: me })
    expect(result.unreadable).toBe(1)
    expect(window.localStorage.getItem('viktkollen.bodyAnalysis.history')).toBe('{not json data:image/jpeg;base64,xx')
  })

  it('needs a resolved user scope and its marker is removed on account deletion', () => {
    expect(runLegacyBodyImageCleanup({ approved: true, scope: { storageId: '' } }).error).toBe('no-scope')
    setActiveUserDataScope({ kind: 'authenticated', userId: 'me' })
    expect(getLocalDeletionKeys()).toContain(getLegacyCleanupMarkerKey(me))
  })

  it('is not wired into the old production flow', () => {
    const card = readFileSync(resolve(process.cwd(), 'src/components/BodyAnalysisCard.jsx'), 'utf8')
    const history = readFileSync(resolve(process.cwd(), 'src/services/bodyAnalysisHistory.js'), 'utf8')
    expect(card).not.toMatch(/legacyBodyImageCleanup|runLegacyBodyImageCleanup/)
    expect(history).not.toMatch(/legacyBodyImageCleanup/)
  })
})
