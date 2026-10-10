/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'

import { itemBankCatalog, itemBankCatalogSize, itemBankCategories } from './itemBankCatalog.js'
import {
  addCustomItem,
  applyVisionVerification,
  createEmptyItemBankState,
  getItemStatus,
  getSelectedItems,
  itemBankVisionReady,
  itemStatuses,
  normalizeItemBankState,
  removeCustomItem,
  resetCarried,
  searchItems,
  setCarried,
  toggleSelected,
} from './itemBankModel.js'
import { getItemBankStorageKey, loadItemBankState, saveItemBankState } from './itemBankStore.js'
import {
  createSlideshowState,
  estimateDurationMs,
  getSlideshowSpeed,
  slideshowReducer,
} from './slideshow.js'

const userA = { kind: 'authenticated', storageId: 'user.aaa', userId: 'aaa' }
const userB = { kind: 'authenticated', storageId: 'user.bbb', userId: 'bbb' }
const guest = { kind: 'guest', storageId: 'guest', userId: '' }
const loading = { kind: 'loading', storageId: '', userId: '' }

const realAnalysis = {
  analysisId: 'frame-123',
  confidence: 0.91,
  source: 'vision-model',
  verifiedAt: '2026-10-10T08:00:00.000Z',
}

afterEach(() => window.localStorage.clear())

describe('Sakbank: katalog och sökning', () => {
  it('has at least 100 unique items in known categories', () => {
    expect(itemBankCatalogSize).toBeGreaterThanOrEqual(100)
    const ids = itemBankCatalog.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    const categoryIds = new Set(itemBankCategories.map((category) => category.id))
    for (const item of itemBankCatalog) {
      expect(categoryIds.has(item.category)).toBe(true)
      expect(item.icon).toBeTruthy()
      expect(item.label).toBeTruthy()
    }
  })

  it('searches by name, keyword, without diacritics and per category', () => {
    const state = createEmptyItemBankState()
    expect(searchItems(state, { query: 'nyck' }).map((item) => item.id)).toContain('keys')
    expect(searchItems(state, { query: 'glasogon' }).map((item) => item.id)).toContain('glasses')
    expect(searchItems(state, { query: 'airpods' }).map((item) => item.id)).toContain('earbuds')
    const health = searchItems(state, { category: 'health' })
    expect(health.length).toBeGreaterThan(5)
    expect(health.every((item) => item.category === 'health')).toBe(true)
    expect(searchItems(state, { category: 'health', query: 'nycklar' })).toEqual([])
  })
})

describe('Sakbank: val, egna saker och status', () => {
  it('selects, deselects and adds custom items that become searchable', () => {
    let state = toggleSelected(createEmptyItemBankState(), 'keys')
    state = toggleSelected(state, 'wallet')
    expect(getSelectedItems(state).map((item) => item.label)).toEqual(['Nycklar', 'Plånbok'])
    state = toggleSelected(state, 'keys')
    expect(state.selectedIds).toEqual(['wallet'])

    const added = addCustomItem(state, { label: '  Gitarr  ' }, 1)
    expect(added.error).toBe('')
    expect(added.item).toMatchObject({ custom: true, label: 'Gitarr' })
    expect(added.state.selectedIds).toContain(added.item.id)
    expect(searchItems(added.state, { query: 'gitarr' })).toHaveLength(1)

    expect(addCustomItem(added.state, { label: '   ' }).error).toBeTruthy()
    // Dublett av katalogsak väljer katalogsaken i stället för att skapa en ny.
    const dup = addCustomItem(added.state, { label: 'nycklar' })
    expect(dup.state.customItems).toHaveLength(1)
    expect(dup.state.selectedIds).toContain('keys')

    const removed = removeCustomItem(added.state, added.item.id)
    expect(removed.customItems).toHaveLength(0)
    expect(removed.selectedIds).not.toContain(added.item.id)
  })

  it('keeps selected, carried and AI-verified clearly separate', () => {
    let state = toggleSelected(createEmptyItemBankState(), 'keys')
    expect(getItemStatus(state, 'wallet')).toBe(itemStatuses.notSelected)
    expect(getItemStatus(state, 'keys')).toBe(itemStatuses.selected)

    state = setCarried(state, 'keys', true)
    expect(getItemStatus(state, 'keys')).toBe(itemStatuses.carried)

    // Medtagen gör aldrig saken AI-verifierad.
    expect(state.status.keys.aiVerification).toBeUndefined()
    state = resetCarried(state)
    expect(getItemStatus(state, 'keys')).toBe(itemStatuses.selected)
  })

  it('never marks AI-verified without a real vision analysis', () => {
    expect(itemBankVisionReady).toBe(false)
    const state = toggleSelected(createEmptyItemBankState(), 'keys')
    for (const fake of [null, {}, { source: 'user' }, { ...realAnalysis, source: 'manual' }, { ...realAnalysis, analysisId: '' }, { ...realAnalysis, confidence: 2 }]) {
      expect(getItemStatus(applyVisionVerification(state, 'keys', fake), 'keys')).toBe(itemStatuses.selected)
    }
    expect(getItemStatus(applyVisionVerification(state, 'wallet', realAnalysis), 'wallet')).toBe(itemStatuses.notSelected)
    expect(getItemStatus(applyVisionVerification(state, 'keys', realAnalysis), 'keys')).toBe(itemStatuses.aiVerified)

    // Förfalskad lagring rensas vid normalisering.
    const forged = normalizeItemBankState({ selectedIds: ['keys'], status: { keys: { aiVerification: { source: 'user' } } } })
    expect(getItemStatus(forged, 'keys')).toBe(itemStatuses.selected)
  })
})

describe('Sakbank: sparande och användarisolering', () => {
  it('persists and reloads the personal list for the same user', () => {
    const state = setCarried(toggleSelected(createEmptyItemBankState(), 'keys'), 'keys', true)
    expect(saveItemBankState({ ...state, speed: 'fast' }, userA).ok).toBe(true)
    const loaded = loadItemBankState(userA)
    expect(loaded.selectedIds).toEqual(['keys'])
    expect(loaded.speed).toBe('fast')
    expect(getItemStatus(loaded, 'keys')).toBe(itemStatuses.carried)
  })

  it('never mixes lists between users or guest', () => {
    saveItemBankState(toggleSelected(createEmptyItemBankState(), 'keys'), userA)
    saveItemBankState(addCustomItem(createEmptyItemBankState(), { label: 'Hemlig sak' }).state, userB)

    expect(getItemBankStorageKey(userA)).not.toBe(getItemBankStorageKey(userB))
    expect(getItemBankStorageKey(userA)).toContain('user.aaa')
    expect(loadItemBankState(userA).selectedIds).toEqual(['keys'])
    expect(loadItemBankState(userA).customItems).toEqual([])
    expect(loadItemBankState(userB).selectedIds).not.toContain('keys')
    expect(loadItemBankState(userB).customItems.map((item) => item.label)).toEqual(['Hemlig sak'])
    expect(loadItemBankState(guest).selectedIds).toEqual([])
  })

  it('does not read or write while the auth scope is still loading', () => {
    expect(getItemBankStorageKey(loading)).toBe('')
    expect(saveItemBankState(toggleSelected(createEmptyItemBankState(), 'keys'), loading).ok).toBe(false)
    expect(window.localStorage.length).toBe(0)
  })
})

describe('Snabbkoll: hastigheter och bildspel', () => {
  it('fast mode shows 30 items in about 10 seconds, normal 1s and calm 2s', () => {
    expect(estimateDurationMs(30, 'fast')).toBeGreaterThanOrEqual(9_500)
    expect(estimateDurationMs(30, 'fast')).toBeLessThanOrEqual(10_500)
    expect(getSlideshowSpeed('normal').intervalMs).toBe(1000)
    expect(getSlideshowSpeed('calm').intervalMs).toBe(2000)
    expect(getSlideshowSpeed('nope').intervalMs).toBe(1000)
  })

  it('starts, pauses, resumes, finishes and restarts', () => {
    let state = createSlideshowState(3)
    expect(slideshowReducer(state, { type: 'tick' })).toBe(state)
    state = slideshowReducer(state, { type: 'start' })
    state = slideshowReducer(state, { type: 'tick' })
    expect(state).toMatchObject({ index: 1, status: 'playing' })
    state = slideshowReducer(state, { type: 'pause' })
    expect(slideshowReducer(state, { type: 'tick' })).toMatchObject({ index: 1, status: 'paused' })
    state = slideshowReducer(state, { type: 'resume' })
    state = slideshowReducer(slideshowReducer(state, { type: 'tick' }), { type: 'tick' })
    expect(state.status).toBe('finished')
    expect(slideshowReducer(state, { type: 'restart' })).toMatchObject({ index: 0, status: 'playing' })
    expect(slideshowReducer(createSlideshowState(0), { type: 'start' }).status).toBe('idle')
  })
})
