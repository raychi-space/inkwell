import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = mkdtempSync(join(tmpdir(), 'inkwell-cache-test-'))
writeFileSync(join(output, 'package.json'), '{"type":"module"}')
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), 'src/shared/api/readApi.ts', '--ignoreConfig', '--target', 'ES2022', '--module', 'ES2022', '--skipLibCheck', '--outDir', output])
const cache = await import(pathToFileURL(join(output, 'sessionCache.js')).href)
const client = await import(pathToFileURL(join(output, 'client.js')).href)
const { readApi } = await import(pathToFileURL(join(output, 'readApi.js')).href)
after(() => rmSync(output, { recursive: true, force: true }))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('concurrent readers share one request; copies, expiry and force refresh remain independent', async t => {
  cache.clearSessionCache()
  const pending = deferred(); let calls = 0
  const loader = () => { calls++; return pending.promise }
  const a = cache.readQuery('list', loader, { ttl: 1000 }), b = cache.readQuery('list', loader)
  pending.resolve({ items: ['one'] })
  const [first, second] = await Promise.all([a, b])
  first.items.push('local edit')
  assert.deepEqual(second.items, ['one'])
  assert.deepEqual(await cache.readQuery('list', loader), { items: ['one'] })
  assert.equal(calls, 1)
  const originalNow = Date.now
  t.after(() => { Date.now = originalNow })
  const now = Date.now(); Date.now = () => now + 1001
  assert.equal(cache.peekRead('list'), undefined)
  await cache.readQuery('list', async () => ({ items: ['expired'] }))
  await cache.readQuery('list', async () => ({ items: ['fresh'] }), { force: true })
  assert.deepEqual(cache.peekRead('list'), { items: ['fresh'] })
})

test('a stopped reader cannot cancel another reader or discard their eventual cache', async () => {
  cache.clearSessionCache()
  const pending = deferred(), controller = new AbortController()
  const stopped = cache.readQuery('shared', () => pending.promise, { signal: controller.signal })
  const active = cache.readQuery('shared', () => { throw Error('must deduplicate') })
  controller.abort()
  await assert.rejects(stopped, { name: 'AbortError' })
  pending.resolve({ ok: true })
  assert.deepEqual(await active, { ok: true })
  assert.deepEqual(cache.peekRead('shared'), { ok: true })
})

test('old responses cannot refill entries after invalidation or supersede a forced refresh', async () => {
  cache.clearSessionCache()
  const old = deferred()
  const a = cache.readQuery('report', () => old.promise)
  cache.invalidateReadCache()
  await cache.readQuery('report', async () => 'new')
  old.resolve('old'); await a
  assert.equal(cache.peekRead('report'), 'new')
  const slow = deferred()
  const b = cache.readQuery('report', () => slow.promise, { force: true })
  await cache.readQuery('report', async () => 'newest', { force: true })
  slow.resolve('slow'); await b
  assert.equal(cache.peekRead('report'), 'newest')
})

test('a session reset clears data and controls and rejects pending and already resolved old reads', async () => {
  cache.clearSessionCache()
  await cache.readQuery('private', async () => ({ owner: 'old' }))
  cache.writeViewState('filter', 'old')
  const oldHit = cache.readQuery('private', async () => 'never')
  const pending = deferred(), oldRequest = cache.readQuery('pending', () => pending.promise)
  cache.clearSessionCache()
  pending.resolve({ owner: 'old' })
  await assert.rejects(oldHit, { name: 'AbortError' })
  await assert.rejects(oldRequest, { name: 'AbortError' })
  assert.equal(cache.peekRead('private'), undefined)
  assert.equal(cache.peekRead('pending'), undefined)
  assert.equal(cache.readViewState('filter', 'default'), 'default')
})

test('entry count, per-entry size and total bytes are bounded by LRU eviction', async () => {
  cache.clearSessionCache()
  for (let i = 0; i < 81; i++) await cache.readQuery('key-' + i, async () => i)
  assert.equal(cache.peekRead('key-0'), undefined)
  assert.equal(cache.peekRead('key-80'), 80)
  await cache.readQuery('oversized', async () => 'x'.repeat(2 * 1024 * 1024))
  assert.equal(cache.peekRead('oversized'), undefined)
  cache.clearSessionCache()
  for (let i = 0; i < 9; i++) await cache.readQuery('large-' + i, async () => 'x'.repeat(1024 * 1024))
  assert.equal(cache.peekRead('large-0'), undefined)
  assert.ok(cache.peekRead('large-8'))
})

for (const status of [200, 409, 503]) {
  test(`admin writes (${status}) invalidate read data but preserve navigation controls`, async t => {
    client.resetAuthSession()
    const original = globalThis.fetch; let reads = 0
    t.after(() => { globalThis.fetch = original; client.resetAuthSession() })
    globalThis.fetch = async (path, options) => {
      const body = path.endsWith('/csrf') ? { token: 'fixture', headerName: 'X-CSRF-TOKEN' } : options.method === 'PUT' ? { code: 'WRITE_FAILED' } : { version: ++reads }
      return new Response(JSON.stringify(body), { status: options.method === 'PUT' ? status : 200 })
    }
    cache.writeViewState('page', 3)
    await readApi('/api/v1/admin/settings')
    await readApi('/api/v1/admin/settings')
    assert.equal(reads, 1)
    const write = client.api('/api/v1/admin/settings', { method: 'PUT', body: '{}' })
    if (status === 200) await write
    else await assert.rejects(write)
    await readApi('/api/v1/admin/settings')
    assert.equal(reads, 2)
    assert.equal(cache.readViewState('page', 1), 3)
  })
}

test('late protected JSON cannot reach a new session even if fetch ignores abort', async t => {
  client.resetAuthSession()
  const original = globalThis.fetch, pending = deferred()
  t.after(() => { globalThis.fetch = original; client.resetAuthSession() })
  globalThis.fetch = () => pending.promise
  const old = readApi('/api/v1/admin/settings')
  client.resetAuthSession()
  pending.resolve(new Response(JSON.stringify({ owner: 'old' })))
  await assert.rejects(old, { code: 'AUTH_REQUIRED' })
  assert.equal(cache.peekRead('/api/v1/admin/settings'), undefined)
})
