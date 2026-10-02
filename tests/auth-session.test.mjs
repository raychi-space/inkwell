import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = mkdtempSync(join(tmpdir(), 'inkwell-auth-test-'))
writeFileSync(join(output, 'package.json'), '{"type":"module"}')
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'),
  'src/shared/api/client.ts', '--ignoreConfig', '--target', 'ES2022', '--module', 'ES2022', '--skipLibCheck', '--outDir', output])
const client = await import(pathToFileURL(join(output, 'client.js')).href)
after(() => rmSync(output, { recursive: true, force: true }))

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const csrf = () => json(200, { token: 'test-token', headerName: 'X-CSRF-TOKEN' })
function scenario(t, fetcher) {
  client.resetAuthSession()
  const original = globalThis.fetch
  globalThis.fetch = fetcher
  let expired = 0
  const unsubscribe = client.onSessionExpired(() => { expired++ })
  t.after(() => { unsubscribe(); client.resetAuthSession(); globalThis.fetch = original })
  return () => expired
}

test('concurrent unauthenticated admin responses expire the session once', async t => {
  const count = scenario(t, async () => json(401, { code: 'AUTH_REQUIRED', message: '请先登录。' }))
  const results = await Promise.allSettled([client.api('/api/v1/admin/articles'), client.api('/api/v1/admin/categories')])
  assert.ok(results.every(value => value.status === 'rejected'))
  assert.equal(count(), 1)
})

test('incorrect credentials and provider errors do not expire the site session', async t => {
  const count = scenario(t, async path => path.endsWith('/csrf') ? csrf() : json(401, {
    code: path.endsWith('/login') ? 'INVALID_CREDENTIALS' : 'MODEL_AUTH_FAILED', message: '拒绝'
  }))
  await assert.rejects(client.api('/api/v1/auth/login', { method: 'POST', body: '{}' }), { code: 'INVALID_CREDENTIALS' })
  await assert.rejects(client.api('/api/v1/admin/ai/providers'), { code: 'MODEL_AUTH_FAILED' })
  assert.equal(count(), 0)
})

test('permission errors and temporary service failures do not sign out', async t => {
  const count = scenario(t, async path => path.endsWith('/csrf') ? csrf() : json(path.endsWith('/ai') ? 503 : 403, {
    code: path.endsWith('/ai') ? 'AGENT_UNAVAILABLE' : 'ACCESS_DENIED'
  }))
  await assert.rejects(client.api('/api/v1/admin/articles'), { code: 'ACCESS_DENIED' })
  await assert.rejects(client.api('/api/v1/admin/ai'), { code: 'AGENT_UNAVAILABLE' })
  assert.equal(count(), 0)
})

for (const authenticated of [true, false]) {
  test(`CSRF failure checks actual session (${authenticated ? 'valid' : 'expired'}) without repeating the write`, async t => {
    let writes = 0, checks = 0
    const count = scenario(t, async path => {
      if (path.endsWith('/csrf')) return csrf()
      if (path.endsWith('/session')) { checks++; return json(200, { authenticated }) }
      writes++
      return json(403, { code: 'CSRF_INVALID' })
    })
    await assert.rejects(client.api('/api/v1/admin/articles', { method: 'POST', body: '{}' }), { code: 'CSRF_INVALID' })
    assert.equal(writes, 1)
    assert.equal(checks, 1)
    assert.equal(count(), authenticated ? 0 : 1)
  })
}

test('late responses from a previous session cannot expire a new login', async t => {
  let resolveResponse
  const count = scenario(t, () => new Promise(resolve => { resolveResponse = resolve }))
  const oldRequest = client.api('/api/v1/admin/articles')
  client.resetAuthSession()
  resolveResponse(json(401, { code: 'AUTH_REQUIRED' }))
  await assert.rejects(oldRequest, { code: 'AUTH_REQUIRED' })
  assert.equal(count(), 0)
})

test('session expiry cancels other outstanding protected requests', async t => {
  let pendingSignal
  const count = scenario(t, async (path, options) => {
    if (path.endsWith('/articles')) return new Promise((_, reject) => {
      pendingSignal = options.signal
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    return json(401, { code: 'AUTH_REQUIRED' })
  })
  const pending = client.api('/api/v1/admin/articles')
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(client.api('/api/v1/admin/categories'), { code: 'AUTH_REQUIRED' })
  await rejected
  assert.equal(pendingSignal.aborted, true)
  assert.equal(count(), 1)
})

test('late CSRF initialization cannot install an old session token', async t => {
  let resolveResponse
  scenario(t, () => new Promise(resolve => { resolveResponse = resolve }))
  const pending = client.refreshCsrf()
  client.resetAuthSession()
  resolveResponse(csrf())
  await assert.rejects(pending, { code: 'AUTH_REQUIRED' })
})
