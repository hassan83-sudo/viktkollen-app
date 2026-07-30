import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CloudSyncPanel from '../../components/CloudSyncPanel.jsx'
import { removeStorage, writeStorage } from '../appStorageService.js'
import {
  buildLocalSyncSnapshot,
  clearCloudSyncLocalState,
  cloudSyncTable,
  createRemoteSyncPayload,
  getCloudSyncStatusModel,
  normalizeRemoteSyncRow,
  normalizeRemoteSyncRows,
  resolveStoredSyncConflict,
  runCloudSync,
  scanLocalSyncChanges,
  setCloudSyncEnabled,
} from './cloudSyncEngine.js'
import { classifySyncChange, resolveSyncConflict, safeMergeSyncPayload } from './syncConflictResolver.js'
import {
  calculateChecksum,
  createLocalSyncRecord,
  getPayloadSizeBytes,
  isAllowedSyncStorageKey,
  isDeniedSyncStorageKey,
  markSyncKeyDirty,
  normalizeSyncMetadata,
  parseStoredSyncValue,
  readSyncMetadata,
  stableSerialize,
  syncDeviceIdStorageKey,
  syncMetadataStorageKey,
  syncStorageAllowlist,
  writeSyncMetadata,
} from './syncMetadata.js'
import {
  enqueueSyncAction,
  getDueSyncQueueItems,
  markSyncQueueItemFailed,
  markSyncQueueItemRunning,
  markSyncQueueItemSucceeded,
  markSyncQueueOffline,
  normalizeSyncQueue,
  normalizeSyncQueueItem,
  readSyncQueue,
  syncQueueStorageKey,
  writeSyncQueue,
} from './syncQueue.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))

  return {
    clear: () => data.clear(),
    getItem: vi.fn((key) => (data.has(key) ? data.get(key) : null)),
    key: (index) => [...data.keys()][index],
    removeItem: vi.fn((key) => {
      data.delete(key)
    }),
    setItem: vi.fn((key, value) => {
      data.set(key, String(value))
    }),
    snapshot: () => Object.fromEntries(data.entries()),
  }
}

function createRemoteRow(storageKey, payload, overrides = {}) {
  const serialized = stableSerialize(payload)

  return {
    checksum: calculateChecksum(serialized),
    client_updated_at: '2026-07-29T10:00:00.000Z',
    data_version: 1,
    deleted_at: null,
    device_id: 'device-remote-123456',
    id: `row-${storageKey}`,
    payload,
    server_updated_at: overrides.server_updated_at || '2026-07-29T10:01:00.000Z',
    storage_key: storageKey,
    user_id: 'user-1',
    ...overrides,
  }
}

function createFakeClient(rows = [], options = {}) {
  const state = {
    rows: [...rows],
    selects: 0,
    tableNames: [],
    upserts: [],
  }
  const client = {
    state,
    from(tableName) {
      state.tableNames.push(tableName)

      return {
        select: vi.fn(async () => {
          state.selects += 1
          if (options.selectError) return { data: null, error: new Error(options.selectError) }

          return { data: state.rows, error: null }
        }),
        upsert: vi.fn(async (payload) => {
          if (options.upsertError) return { data: null, error: new Error(options.upsertError) }
          state.upserts.push(payload)
          state.rows = [
            ...state.rows.filter((row) => row.storage_key !== payload.storage_key),
            {
              ...payload,
              id: `row-${payload.storage_key}`,
              server_updated_at: '2026-07-29T10:02:00.000Z',
            },
          ]

          return { data: [state.rows.at(-1)], error: null }
        }),
      }
    },
  }

  return client
}

beforeEach(() => {
  vi.restoreAllMocks()
  delete globalThis.window
  delete globalThis.navigator
})

describe('Cloud Sync V2 allowlist and metadata', () => {
  it.each(syncStorageAllowlist)('allows %s', (storageKey) => {
    expect(isAllowedSyncStorageKey(storageKey)).toBe(true)
  })

  it.each([
    'viktkollen.auth',
    'viktkollen.session',
    'viktkollen.supabase.auth.token',
    'viktkollen.accessToken',
    'viktkollen.refresh_token',
    'viktkollen.secret',
    'viktkollen.apiKey',
    'viktkollen.api-key',
    'viktkollen.syncMetadata',
    'viktkollen.syncQueue',
    'viktkollen.clientId',
    'viktkollen.preRestoreBackup',
    'viktkollen.cloudBackup.meta',
  ])('rejects unsafe or non-app sync key %s', (storageKey) => {
    expect(isAllowedSyncStorageKey(storageKey)).toBe(false)
  })

  it.each([
    ['auth keyword', 'viktkollen.auth.user'],
    ['session keyword', 'viktkollen.session.value'],
    ['supabase keyword', 'viktkollen.supabase.project'],
    ['token keyword', 'viktkollen.token.value'],
    ['secret keyword', 'viktkollen.secret.value'],
    ['api key keyword', 'viktkollen.api_key.value'],
  ])('flags denied pattern for %s', (_, storageKey) => {
    expect(isDeniedSyncStorageKey(storageKey)).toBe(true)
  })

  it('stable serializes object keys deterministically', () => {
    expect(stableSerialize({ b: 2, a: 1 })).toBe(stableSerialize({ a: 1, b: 2 }))
  })

  it('stable serialization ignores unsafe prototype keys', () => {
    expect(stableSerialize({ ok: true, __proto__: { polluted: true } })).toBe('{"ok":true}')
  })

  it('checksums identical payloads equally', () => {
    expect(calculateChecksum({ a: 1, b: 2 })).toBe(calculateChecksum({ b: 2, a: 1 }))
  })

  it('checksums different payloads differently', () => {
    expect(calculateChecksum({ a: 1 })).not.toBe(calculateChecksum({ a: 2 }))
  })

  it('measures payload bytes without exposing unsafe values', () => {
    expect(getPayloadSizeBytes({ name: 'test' })).toBeGreaterThan(0)
  })

  it.each([
    [null, true, true],
    [undefined, true, true],
    ['{"ok":true}', false, true],
    ['not-json', false, false],
  ])('parses stored value %s', (raw, deleted, ok) => {
    const parsed = parseStoredSyncValue(raw)

    expect(parsed.deleted).toBe(deleted)
    expect(parsed.ok).toBe(ok)
  })

  it('reads malformed metadata as safe defaults', () => {
    const storage = createMemoryStorage({ [syncMetadataStorageKey]: '{bad json' })

    expect(readSyncMetadata(storage)).toMatchObject({ enabled: false, pendingKeys: [] })
  })

  it('normalizes metadata and drops unsafe keys', () => {
    const metadata = normalizeSyncMetadata({
      conflicts: [{ storageKey: 'viktkollen.token' }, { storageKey: 'viktkollen.profile' }],
      keys: {
        'viktkollen.profile': { checksum: 'abc', updatedAt: 'now' },
        'viktkollen.auth': { checksum: 'secret' },
      },
      pendingKeys: ['viktkollen.profile', 'viktkollen.auth'],
    })

    expect(metadata.conflicts).toHaveLength(1)
    expect(metadata.keys['viktkollen.auth']).toBeUndefined()
    expect(metadata.pendingKeys).toEqual(['viktkollen.profile'])
  })

  it('writes normalized metadata', () => {
    const storage = createMemoryStorage()
    writeSyncMetadata({ enabled: true, pendingKeys: ['viktkollen.profile'] }, storage)

    expect(JSON.parse(storage.getItem(syncMetadataStorageKey))).toMatchObject({
      enabled: true,
      pendingKeys: ['viktkollen.profile'],
    })
  })

  it('marks allowlisted keys dirty', () => {
    const storage = createMemoryStorage()

    markSyncKeyDirty('viktkollen.profile', storage, '2026-07-29T10:00:00.000Z')

    expect(readSyncMetadata(storage).pendingKeys).toContain('viktkollen.profile')
  })

  it('does not mark denied keys dirty', () => {
    const storage = createMemoryStorage()

    markSyncKeyDirty('viktkollen.auth.token', storage)

    expect(readSyncMetadata(storage).pendingKeys).toHaveLength(0)
  })

  it('creates local records with payload and checksum', () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    const record = createLocalSyncRecord('viktkollen.profile', storage, '2026-07-29T10:00:00.000Z')

    expect(record).toMatchObject({ deleted: false, ok: true, payload: { name: 'Anna' }, storageKey: 'viktkollen.profile' })
  })

  it('creates local tombstone records for missing keys', () => {
    const storage = createMemoryStorage()

    expect(createLocalSyncRecord('viktkollen.profile', storage).deleted).toBe(true)
  })

  it('flags malformed local JSON records as unsafe to upload', () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': '{bad json' })

    expect(createLocalSyncRecord('viktkollen.profile', storage).ok).toBe(false)
  })

  it('clears sync user state without deleting device id', () => {
    const storage = createMemoryStorage({ [syncDeviceIdStorageKey]: 'device-abc-123456789' })

    writeSyncMetadata({ enabled: true, pendingKeys: ['viktkollen.profile'] }, storage)
    const cleared = clearCloudSyncLocalState(storage)

    expect(cleared.enabled).toBe(false)
    expect(cleared.pendingKeys).toHaveLength(0)
    expect(cleared.deviceId).toContain('device-')
  })

  it('app storage writes mark synced app data dirty', () => {
    const storage = createMemoryStorage()
    globalThis.window = { localStorage: storage }

    expect(writeStorage('viktkollen.profile', { goalWeight: 78 })).toBe(true)
    expect(readSyncMetadata(storage).pendingKeys).toContain('viktkollen.profile')
  })

  it('app storage removes mark synced app data dirty', () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': '{"goalWeight":78}' })
    globalThis.window = { localStorage: storage }

    expect(removeStorage('viktkollen.profile')).toBe(true)
    expect(readSyncMetadata(storage).pendingKeys).toContain('viktkollen.profile')
  })
})

describe('Cloud Sync V2 queue', () => {
  it.each([
    ['upload', 'viktkollen.profile'],
    ['download', 'viktkollen.weights'],
    ['delete', 'viktkollen.meals'],
    ['resolve-conflict', 'viktkollen.recipes'],
  ])('normalizes %s queue action', (action, storageKey) => {
    expect(normalizeSyncQueueItem({ action, storageKey })).toMatchObject({ action, storageKey, status: 'pending' })
  })

  it.each([
    'viktkollen.auth',
    'viktkollen.session',
    'viktkollen.cloudBackup.meta',
    '',
  ])('drops invalid queue key %s', (storageKey) => {
    expect(normalizeSyncQueueItem({ action: 'upload', storageKey })).toBeNull()
  })

  it('deduplicates queue items per action and storage key', () => {
    const queue = normalizeSyncQueue({
      items: [
        { action: 'upload', storageKey: 'viktkollen.profile', id: 'a' },
        { action: 'upload', storageKey: 'viktkollen.profile', id: 'b' },
      ],
    })

    expect(queue.items).toHaveLength(1)
  })

  it('enqueues new pending action first', () => {
    const queue = enqueueSyncAction({ items: [] }, { action: 'upload', storageKey: 'viktkollen.profile' })

    expect(queue.items[0]).toMatchObject({ action: 'upload', storageKey: 'viktkollen.profile', status: 'pending' })
  })

  it('reads malformed queue safely', () => {
    const storage = createMemoryStorage({ [syncQueueStorageKey]: '{bad' })

    expect(readSyncQueue(storage).items).toHaveLength(0)
  })

  it('writes normalized queue', () => {
    const storage = createMemoryStorage()

    writeSyncQueue({ items: [{ action: 'upload', storageKey: 'viktkollen.profile' }] }, storage)

    expect(JSON.parse(storage.getItem(syncQueueStorageKey)).items).toHaveLength(1)
  })

  it('returns due queue items when online', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })

    expect(getDueSyncQueueItems(queue, new Date('2026-07-29T10:00:00.000Z'), true)).toHaveLength(1)
  })

  it('returns no due queue items when offline', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })

    expect(getDueSyncQueueItems(queue, new Date('2026-07-29T10:00:00.000Z'), false)).toHaveLength(0)
  })

  it('skips running queue items', () => {
    const queue = normalizeSyncQueue({ items: [{ action: 'upload', status: 'running', storageKey: 'viktkollen.profile' }] })

    expect(getDueSyncQueueItems(queue)).toHaveLength(0)
  })

  it('marks queue item running', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })
    const running = markSyncQueueItemRunning(queue, queue.items[0].id, '2026-07-29T10:00:00.000Z')

    expect(running.items[0].status).toBe('running')
  })

  it('removes succeeded queue item', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })

    expect(markSyncQueueItemSucceeded(queue, queue.items[0].id).items).toHaveLength(0)
  })

  it('backs off failed queue item', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })
    const failed = markSyncQueueItemFailed(queue, queue.items[0].id, 'network', new Date('2026-07-29T10:00:00.000Z'))

    expect(failed.items[0]).toMatchObject({ attempts: 1, status: 'pending', error: 'network' })
    expect(failed.items[0].nextAttemptAt).toContain('2026-07-29T10:01')
  })

  it('caps failed queue items after max attempts', () => {
    const queue = normalizeSyncQueue({ items: [{ action: 'upload', attempts: 5, id: 'a', storageKey: 'viktkollen.profile' }] })

    expect(getDueSyncQueueItems(queue)).toHaveLength(0)
  })

  it('marks running items pending when offline', () => {
    const queue = normalizeSyncQueue({ items: [{ action: 'upload', status: 'running', storageKey: 'viktkollen.profile' }] })

    expect(markSyncQueueOffline(queue).items[0].status).toBe('pending')
  })

  it('marks pending items waiting offline', () => {
    const queue = enqueueSyncAction({}, { action: 'upload', storageKey: 'viktkollen.profile' })

    expect(markSyncQueueOffline(queue).items[0].status).toBe('waiting_offline')
  })
})

describe('Cloud Sync V2 conflicts', () => {
  const localProfile = { storageKey: 'viktkollen.profile', payload: { name: 'Local' }, checksum: calculateChecksum({ name: 'Local' }) }
  const remoteProfile = { storageKey: 'viktkollen.profile', payload: { name: 'Remote' }, checksum: calculateChecksum({ name: 'Remote' }) }

  it.each([
    ['identical', localProfile, { checksum: localProfile.checksum }, { ...localProfile }],
    ['local_changed', localProfile, { checksum: 'old' }, null],
    ['remote_changed', { ...localProfile, checksum: 'old' }, { checksum: 'old' }, remoteProfile],
    ['conflict', localProfile, { checksum: 'old' }, remoteProfile],
    ['local_deleted', { storageKey: 'viktkollen.profile', deleted: true, checksum: calculateChecksum(null) }, { checksum: 'old' }, null],
    ['remote_deleted', { ...localProfile, checksum: 'old' }, { checksum: 'old' }, { ...remoteProfile, deleted_at: '2026-07-29T10:00:00.000Z' }],
  ])('classifies %s', (expected, localRecord, metadata, remoteRecord) => {
    expect(classifySyncChange({ localRecord, metadata, remoteRecord })).toBe(expected)
  })

  it('downloads remote-only records on first sync', () => {
    expect(classifySyncChange({
      localRecord: { deleted: true, checksum: calculateChecksum(null) },
      metadata: {},
      remoteRecord: remoteProfile,
    })).toBe('remote_changed')
  })

  it('does not treat a never-seen missing local key as a local change', () => {
    expect(classifySyncChange({
      localRecord: { deleted: true, checksum: calculateChecksum(null) },
      metadata: {},
      remoteRecord: null,
    })).toBe('local_deleted')
  })

  it('merges arrays by id and latest timestamp', () => {
    const merge = safeMergeSyncPayload(
      [{ id: '1', name: 'old', updatedAt: '2026-07-28' }],
      [{ id: '1', name: 'new', updatedAt: '2026-07-29' }, { id: '2', name: 'remote' }],
    )

    expect(merge.conflict).toBe(false)
    expect(merge.payload).toEqual([{ id: '1', name: 'new', updatedAt: '2026-07-29' }, { id: '2', name: 'remote' }])
  })

  it('merges weekly day structures', () => {
    const merge = safeMergeSyncPayload(
      { weeks: { '2026-07-27': { days: { monday: [{ id: 'a', name: 'Local' }] } } } },
      { weeks: { '2026-07-27': { days: { monday: [{ id: 'b', name: 'Remote' }] } } } },
    )

    expect(merge.payload.weeks['2026-07-27'].days.monday).toHaveLength(2)
  })

  it('uses latest timestamp for simple objects', () => {
    const merge = safeMergeSyncPayload({ updatedAt: '2026-07-28', value: 1 }, { updatedAt: '2026-07-29', value: 2 })

    expect(merge.payload.value).toBe(2)
  })

  it('keeps unsafe payloads as manual conflicts', () => {
    const merge = safeMergeSyncPayload({ constructor: 'x' }, { ok: true })

    expect(merge.conflict).toBe(true)
  })

  it('resolves safe conflict by merge upload', () => {
    const result = resolveSyncConflict({
      localRecord: { checksum: 'local', payload: [{ id: 'a' }], storageKey: 'viktkollen.meals' },
      metadata: { checksum: 'old' },
      remoteRecord: { checksum: 'remote', payload: [{ id: 'b' }], storageKey: 'viktkollen.meals' },
    })

    expect(result.action).toBe('merge_upload')
  })

  it('keeps unsafe conflict for manual resolution', () => {
    const result = resolveSyncConflict({
      localRecord: { checksum: 'local', payload: { value: 1 }, storageKey: 'viktkollen.profile' },
      metadata: { checksum: 'old' },
      remoteRecord: { checksum: 'remote', payload: { value: 2 }, storageKey: 'viktkollen.profile' },
    })

    expect(result.action).toBe('conflict')
  })
})

describe('Cloud Sync V2 engine', () => {
  it('uses the dedicated sync item table', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    const client = createFakeClient([])

    await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(client.state.tableNames).toContain(cloudSyncTable)
  })

  it('builds local snapshot from allowlisted keys only', () => {
    const storage = createMemoryStorage({
      'viktkollen.auth.token': JSON.stringify({ token: 'secret' }),
      'viktkollen.profile': JSON.stringify({ name: 'Anna' }),
    })
    const snapshot = buildLocalSyncSnapshot(storage)

    expect(snapshot.records.some((record) => record.storageKey === 'viktkollen.profile')).toBe(true)
    expect(snapshot.records.some((record) => record.storageKey === 'viktkollen.auth.token')).toBe(false)
  })

  it('normalizes remote rows and drops denied keys', () => {
    const rows = normalizeRemoteSyncRows([
      createRemoteRow('viktkollen.profile', { name: 'Anna' }),
      createRemoteRow('viktkollen.auth.token', { token: 'secret' }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].storageKey).toBe('viktkollen.profile')
  })

  it('creates upload payload without sync metadata', () => {
    const record = { checksum: 'abc', clientUpdatedAt: 'now', dataVersion: 1, payload: { name: 'Anna' }, storageKey: 'viktkollen.profile' }
    const payload = createRemoteSyncPayload(record, 'user-1', 'device-1')

    expect(payload).toMatchObject({ storage_key: 'viktkollen.profile', user_id: 'user-1', device_id: 'device-1' })
    expect(payload.storage_key).not.toBe(syncMetadataStorageKey)
  })

  it('returns disabled when autosync is off and force is false', async () => {
    const result = await runCloudSync({ client: createFakeClient([]), storage: createMemoryStorage(), userId: 'user-1' })

    expect(result.status).toBe('disabled')
  })

  it('returns not authenticated without user id', async () => {
    const result = await runCloudSync({ client: createFakeClient([]), force: true, storage: createMemoryStorage() })

    expect(result.status).toBe('not_authenticated')
  })

  it('returns offline and keeps pending queue', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    markSyncKeyDirty('viktkollen.profile', storage)
    const result = await runCloudSync({ client: createFakeClient([]), force: true, online: false, storage, userId: 'user-1' })

    expect(result.status).toBe('offline')
    expect(readSyncMetadata(storage).lastError).toContain('nätverksanslutning')
  })

  it('uploads changed local records', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    const client = createFakeClient([])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.uploaded).toContain('viktkollen.profile')
    expect(client.state.upserts[0].payload).toEqual({ name: 'Anna' })
  })

  it('does not upload tombstones for never-seen empty keys', async () => {
    const storage = createMemoryStorage()
    const client = createFakeClient([])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.uploaded).toHaveLength(0)
    expect(client.state.upserts).toHaveLength(0)
  })

  it('downloads remote-only records', async () => {
    const storage = createMemoryStorage()
    const client = createFakeClient([createRemoteRow('viktkollen.profile', { name: 'Remote' })])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.downloaded).toContain('viktkollen.profile')
    expect(JSON.parse(storage.getItem('viktkollen.profile'))).toEqual({ name: 'Remote' })
  })

  it('applies remote tombstones', async () => {
    const payload = { name: 'Remote' }
    const checksum = calculateChecksum(stableSerialize(payload))
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify(payload) })
    writeSyncMetadata({ keys: { 'viktkollen.profile': { checksum } } }, storage)
    const client = createFakeClient([createRemoteRow('viktkollen.profile', null, { checksum: calculateChecksum(null), deleted_at: '2026-07-29T10:00:00.000Z' })])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.downloaded).toContain('viktkollen.profile')
    expect(storage.getItem('viktkollen.profile')).toBeNull()
  })

  it('merges compatible array conflicts and uploads merged payload', async () => {
    const storage = createMemoryStorage({ 'viktkollen.meals': JSON.stringify([{ id: 'local', updatedAt: '2026-07-29' }]) })
    writeSyncMetadata({ keys: { 'viktkollen.meals': { checksum: 'old' } } }, storage)
    const client = createFakeClient([createRemoteRow('viktkollen.meals', [{ id: 'remote', updatedAt: '2026-07-29' }], { checksum: 'remote' })])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.uploaded).toContain('viktkollen.meals')
    expect(JSON.parse(storage.getItem('viktkollen.meals'))).toHaveLength(2)
  })

  it('stores incompatible conflicts without overwriting local data', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Local' }) })
    writeSyncMetadata({ keys: { 'viktkollen.profile': { checksum: 'old' } } }, storage)
    const client = createFakeClient([createRemoteRow('viktkollen.profile', { name: 'Remote' }, { checksum: 'remote' })])
    const result = await runCloudSync({ client, force: true, storage, userId: 'user-1' })

    expect(result.status).toBe('conflict')
    expect(JSON.parse(storage.getItem('viktkollen.profile'))).toEqual({ name: 'Local' })
    expect(readSyncMetadata(storage).conflicts[0].storageKey).toBe('viktkollen.profile')
  })

  it('resolves stored conflict by choosing remote', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Local' }) })
    writeSyncMetadata({
      conflicts: [{
        remoteRecord: createRemoteRow('viktkollen.profile', { name: 'Remote' }),
        storageKey: 'viktkollen.profile',
      }],
    }, storage)
    const result = await resolveStoredSyncConflict('viktkollen.profile', 'remote', { client: createFakeClient([]), storage, userId: 'user-1' })

    expect(result.status).toBe('resolved')
    expect(JSON.parse(storage.getItem('viktkollen.profile'))).toEqual({ name: 'Remote' })
  })

  it('resolves stored conflict by choosing local', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Local' }) })
    const localRecord = createLocalSyncRecord('viktkollen.profile', storage)
    writeSyncMetadata({
      conflicts: [{ localRecord, storageKey: 'viktkollen.profile' }],
    }, storage)
    const client = createFakeClient([])
    const result = await resolveStoredSyncConflict('viktkollen.profile', 'local', { client, storage, userId: 'user-1' })

    expect(result.status).toBe('resolved')
    expect(client.state.upserts[0].payload).toEqual({ name: 'Local' })
  })

  it('keeps safe error messages on select failure', async () => {
    const result = await runCloudSync({ client: createFakeClient([], { selectError: 'service down' }), force: true, storage: createMemoryStorage(), userId: 'user-1' })

    expect(result).toMatchObject({ ok: false, status: 'error' })
    expect(result.error).not.toMatch(/undefined|null|\[object Object\]/)
  })

  it('keeps safe error messages on upsert failure', async () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    const result = await runCloudSync({ client: createFakeClient([], { upsertError: 'write failed' }), force: true, storage, userId: 'user-1' })

    expect(result).toMatchObject({ ok: false, status: 'error' })
    expect(readSyncMetadata(storage).lastError).toBe('write failed')
  })

  it('scans local changes into a persistent queue', () => {
    const storage = createMemoryStorage({ 'viktkollen.profile': JSON.stringify({ name: 'Anna' }) })
    const scan = scanLocalSyncChanges(storage)

    expect(scan.changedKeys).toContain('viktkollen.profile')
    expect(readSyncQueue(storage).items[0].storageKey).toBe('viktkollen.profile')
  })

  it('does not scan untouched missing keys into queue', () => {
    const storage = createMemoryStorage()

    expect(scanLocalSyncChanges(storage).changedKeys).toHaveLength(0)
  })

  it('enables and disables autosync in metadata', () => {
    const storage = createMemoryStorage()

    expect(setCloudSyncEnabled(true, storage).enabled).toBe(true)
    expect(setCloudSyncEnabled(false, storage).enabled).toBe(false)
  })

  it('builds status model from metadata and queue', () => {
    const storage = createMemoryStorage()
    setCloudSyncEnabled(true, storage)
    markSyncKeyDirty('viktkollen.profile', storage)

    expect(getCloudSyncStatusModel(storage, true)).toMatchObject({ enabled: true, isOnline: true })
  })

  it('normalizes a single remote row', () => {
    expect(normalizeRemoteSyncRow(createRemoteRow('viktkollen.profile', { name: 'Anna' }))).toMatchObject({
      payload: { name: 'Anna' },
      storageKey: 'viktkollen.profile',
    })
  })

  it('rejects unknown remote rows', () => {
    expect(normalizeRemoteSyncRow(createRemoteRow('viktkollen.unknown', { value: 1 }))).toBeNull()
  })
})

describe('Cloud Sync V2 UI', () => {
  it('does not render for signed-out users', () => {
    expect(renderToStaticMarkup(<CloudSyncPanel isAuthenticated={false} userId="" />)).toBe('')
  })

  it.each([
    'Cloud Sync V2',
    'Automatisk sync',
    'Synca nu',
    'Autosync',
    'Senast klar',
    'Väntande',
    'Nätverk',
    'Enhet',
    'Konflikter',
    'Manuell Cloud Backup finns kvar separat',
  ])('renders %s for signed-in users', (expected) => {
    expect(renderToStaticMarkup(<CloudSyncPanel isAuthenticated userId="user-1" />)).toContain(expected)
  })

  it('renders conflict actions', () => {
    const storage = createMemoryStorage()
    globalThis.window = { localStorage: storage }
    writeSyncMetadata({
      conflicts: [{ reason: 'Testkonflikt', storageKey: 'viktkollen.profile' }],
    }, storage)

    const html = renderToStaticMarkup(<CloudSyncPanel isAuthenticated userId="user-1" />)

    expect(html).toContain('Behåll lokal')
    expect(html).toContain('Använd moln')
  })

  it('does not render unsafe placeholders', () => {
    const html = renderToStaticMarkup(<CloudSyncPanel isAuthenticated userId="user-1" />)

    expect(html).not.toMatch(/NaN|Infinity|undefined|null|\[object Object\]/)
  })
})
