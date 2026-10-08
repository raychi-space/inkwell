/** Real authenticated downloads; only disposable fixtures may be modified. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.RAYCHI_E2E_CONFIRM_ISOLATED, '1')
const credentials = JSON.parse(readFileSync(process.env.RAYCHI_EXPORT_E2E_CREDENTIALS, 'utf8'))
const api = process.env.RAYCHI_E2E_API ?? credentials.api
const studio = process.env.RAYCHI_E2E_STUDIO ?? credentials.studio
const { chromium } = await import(pathToFileURL(process.env.RAYCHI_E2E_PLAYWRIGHT).href)
const browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
const owner = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 390, height: 844 } })
const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
let csrf
const ids = []
async function req(path, method = 'GET', data, expected = 200) {
  const response = await owner.request.fetch(api + path, { method,
    headers: csrf ? { [csrf.headerName]: csrf.token } : {}, ...(data === undefined ? {} : { data }) })
  assert.equal(response.status(), expected, `${method} ${path}`)
  return expected === 204 ? undefined : response.json()
}
function unpack(bytes) {
  // The service bounds archives to 64MiB, so ZIP64 is neither needed nor accepted.
  const end = bytes.length - 22
  assert.equal(bytes.readUInt32LE(end), 0x06054b50)
  const files = new Map()
  let offset = bytes.readUInt32LE(end + 16)
  for (let index = 0; index < bytes.readUInt16LE(end + 10); index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50)
    const method = bytes.readUInt16LE(offset + 10), size = bytes.readUInt32LE(offset + 20)
    const length = bytes.readUInt16LE(offset + 28)
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString('utf8')
    assert.ok(!name.startsWith('/') && !name.includes('..'))
    const local = bytes.readUInt32LE(offset + 42)
    assert.equal(bytes.readUInt32LE(local), 0x04034b50)
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const raw = bytes.subarray(start, start + size)
    const data = method === 8 ? inflateRawSync(raw) : (assert.equal(method, 0), raw)
    assert.equal(data.length, bytes.readUInt32LE(offset + 24))
    assert.equal(files.has(name), false)
    files.set(name, data)
    offset += 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
  const manifest = JSON.parse(files.get('manifest.json'))
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.files.length, files.size - 1)
  for (const file of manifest.files) {
    assert.equal(files.get(file.path).length, file.byteSize)
    assert.equal(createHash('sha256').update(files.get(file.path)).digest('hex'), file.sha256)
  }
  return files
}
async function draft(type, title, body, coverUrl = null) {
  let item = await req('/api/v1/admin/contents?type=' + type, 'POST', {}, 201)
  ids.push(item.id)
  item = await req('/api/v1/admin/contents/' + item.id, 'PUT', { version: item.version,
    slug: type === 'ARTICLE' ? 'export-' + randomUUID() : item.slug, title, bodyMarkdown: body,
    tags: [], category: type === 'ARTICLE' ? '未分类' : null, coverUrl, publicationMetadata: true })
  return item
}
try {
  csrf = await req('/api/v1/auth/csrf')
  await req('/api/v1/auth/login', 'POST', { username: credentials.username, password: credentials.password })
  csrf = await req('/api/v1/auth/csrf')
  const title = '导出验收-' + randomUUID().slice(0, 8)
  let article = await draft('ARTICLE', title, '# ' + title + '\n\n公开正文。')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=', 'base64')
  const response = await owner.request.post(api + `/api/v1/admin/articles/${article.id}/assets`, {
    headers: { [csrf.headerName]: csrf.token }, multipart: { file: { name: 'image.png', mimeType: 'image/png', buffer: png } } })
  assert.equal(response.status(), 201)
  const image = await response.json()
  article = await req('/api/v1/admin/contents/' + article.id, 'PUT', { version: article.version, slug: article.slug,
    title, bodyMarkdown: '# ' + title + '\n\n公开正文。\n\n![图片](' + image.url + ')',
    tags: [], category: '未分类', coverUrl: image.url, publicationMetadata: true })
  article = await req(`/api/v1/admin/contents/${article.id}/publish`, 'POST', { expectedVersion: article.version, metadataReviewed: true })
  article = await req('/api/v1/admin/contents/' + article.id, 'PUT', { version: article.version, slug: article.slug,
    title, bodyMarkdown: '# ' + title + '\n\n私密工作稿。\n\n![图片](' + image.url + ')',
    tags: [], category: '未分类', coverUrl: image.url, publicationMetadata: true })
  const endpoint = `/api/v1/admin/contents/${article.id}/export?expectedVersion=${article.version}`
  assert.equal((await anonymous.request.get(api + endpoint)).status(), 401)
  const page = await owner.newPage()
  await page.goto(studio)
  await page.locator('.content-row').filter({ hasText: title }).click()
  const button = page.getByRole('button', { name: '导出已保存内容', exact: true })
  await button.waitFor()
  const downloaded = page.waitForEvent('download')
  await button.click()
  const download = await downloaded
  assert.equal(download.suggestedFilename(), `raychi-${article.id}-v${article.version}.zip`)
  const files = unpack(readFileSync(await download.path()))
  assert.equal(files.get(`assets/${image.id}.png`).equals(png), true)
  assert.ok(files.get('draft.md').toString().includes('私密工作稿。'))
  assert.ok(files.get('published.md').toString().includes('公开正文。'))
  assert.ok(!files.get('draft.md').toString().includes('/api/v1/'))
  const data = JSON.parse(files.get('content.json'))
  assert.equal(data.draft.bodyMarkdown, article.bodyMarkdown)
  assert.ok(data.published.bodyMarkdown.includes('公开正文。'))
  assert.equal((await req('/api/v1/admin/contents/' + article.id)).version, article.version)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  // Unsaved editor input does not silently enter an archive or trigger a save.
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' 尚未保存')
  assert.equal(await button.isDisabled(), true)
  assert.ok((await button.getAttribute('title')).includes('先保存'))
  await page.reload()
  await page.locator('.content-row').filter({ hasText: title }).click()
  // Actual server version mismatch keeps editor content and offers reload via message.
  const changed = await req('/api/v1/admin/contents/' + article.id, 'PUT', { version: article.version,
    slug: article.slug, title, bodyMarkdown: article.bodyMarkdown + '\n\n其他会话的新保存。',
    tags: [], category: '未分类', coverUrl: image.url, publicationMetadata: true })
  await button.click()
  await page.getByText('内容已改变，请重新加载后导出。', { exact: true }).waitFor()
  assert.equal((await req('/api/v1/admin/contents/' + article.id)).version, changed.version)
  // Frontend failure feedback and leaving a pending request exercise real controls;
  // authentication, bytes, ZIP and conflict above use the actual server.
  await page.route('**/admin/contents/*/export?**', async route => route.fulfill({ status: 500,
    json: { code: 'CONTENT_EXPORT_FAILED', message: '无法生成完整导出包，请检查附件后重试。' } }))
  await button.click()
  await page.getByText('无法生成完整导出包，请检查附件后重试。', { exact: true }).waitFor()
  await page.unroute('**/admin/contents/*/export?**')
  let release, seen
  const gate = new Promise(resolve => { release = resolve })
  const intercepted = new Promise(resolve => { seen = resolve })
  const downloads = []
  page.on('download', value => downloads.push(value))
  await page.route('**/admin/contents/*/export?**', async route => {
    seen()
    await gate
    await route.fulfill({ status: 200, contentType: 'application/zip', body: readFileSync(await download.path()) }).catch(() => {})
  })
  await button.click()
  await intercepted
  await page.getByRole('button', { name: '← 返回内容管理', exact: true }).click()
  await page.locator('.content-row').filter({ hasText: title }).waitFor()
  release()
  await page.waitForTimeout(300)
  assert.equal(downloads.length, 0, 'leaving the editor aborts a pending download')
  await page.unroute('**/admin/contents/*/export?**')
  await page.locator('.content-row').filter({ hasText: title }).click()
  const postTitle = '导出帖子-' + randomUUID().slice(0, 8)
  const post = await draft('POST', postTitle, postTitle + '\n\n私密帖子正文。')
  const postResponse = await owner.request.get(api + `/api/v1/admin/contents/${post.id}/export?expectedVersion=${post.version}`)
  assert.equal(postResponse.status(), 200)
  const postFiles = unpack(await postResponse.body())
  assert.equal(postFiles.has('published.md'), false)
  assert.equal(JSON.parse(postFiles.get('content.json')).published, null)
  // Logging out while the editor is open must use the shared session-expired flow.
  await req('/api/v1/auth/logout', 'POST', undefined, 204)
  await button.click()
  await page.getByRole('button', { name: '登录', exact: true }).waitFor()
  console.log('PASS content export: authenticated actual ZIP/image/SHA256, private draft + public snapshot, relative Markdown, unchanged version, POST/no-public export, unsaved disabled, actual version conflict/session expiry, failure feedback/navigation abort, 390px')
} finally {
  // Reauthenticate only for disposal after the session-expiry scenario.
  csrf = await req('/api/v1/auth/csrf')
  await req('/api/v1/auth/login', 'POST', { username: credentials.username, password: credentials.password })
  csrf = await req('/api/v1/auth/csrf')
  for (const id of ids) {
    const current = await req('/api/v1/admin/contents/' + id).catch(() => null)
    if (current) await req(`/api/v1/admin/contents/${id}?expectedVersion=${current.version}`, 'DELETE', undefined, 204)
  }
  await browser.close()
}
