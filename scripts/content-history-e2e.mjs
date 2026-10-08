/** Real revisions/restores against a disposable content DB and production studio. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.RAYCHI_E2E_CONFIRM_ISOLATED, '1')
const credentials = JSON.parse(readFileSync(process.env.RAYCHI_HISTORY_E2E_CREDENTIALS, 'utf8'))
const api = process.env.RAYCHI_E2E_API ?? credentials.api
const studio = process.env.RAYCHI_E2E_STUDIO ?? credentials.studio
const { chromium } = await import(pathToFileURL(process.env.RAYCHI_E2E_PLAYWRIGHT).href)
const browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } })
const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
const ids = []
let csrf
async function req(path, method = 'GET', data, expected = 200) {
  const response = await owner.request.fetch(api + path, { method,
    headers: csrf ? { [csrf.headerName]: csrf.token } : {}, ...(data === undefined ? {} : { data }) })
  assert.equal(response.status(), expected, `${method} ${path}`)
  return expected === 204 ? undefined : response.json()
}
async function save(item, title, body, coverUrl = null) {
  return req('/api/v1/admin/contents/' + item.id, 'PUT', { version: item.version, slug: item.slug,
    title, summary: title + '摘要', bodyMarkdown: body, tags: ['修订验收'], category: item.category,
    coverUrl, publicationMetadata: true })
}
async function create(type) {
  const item = await req('/api/v1/admin/contents?type=' + type, 'POST', {}, 201)
  ids.push(item.id)
  return item
}
try {
  csrf = await req('/api/v1/auth/csrf')
  await req('/api/v1/auth/login', 'POST', { username: credentials.username, password: credentials.password })
  csrf = await req('/api/v1/auth/csrf')
  const title = '历史验收-' + randomUUID().slice(0, 8)
  let item = await create('ARTICLE')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=', 'base64')
  const upload = await owner.request.post(api + `/api/v1/admin/articles/${item.id}/assets`, {
    headers: { [csrf.headerName]: csrf.token }, multipart: { file: { name: 'image.png', mimeType: 'image/png', buffer: png } } })
  assert.equal(upload.status(), 201)
  const image = await upload.json()
  const oldBody = '# ' + title + '\n\n旧版本正文。\n\n![图](' + image.url + ')\n\n<script>window.historyProbe="bad"</script>'
  item = await save(item, title, oldBody, image.url)
  const endpoint = '/api/v1/admin/contents/' + item.id + '/revisions'
  const original = (await req(endpoint)).items[0]
  item = await req(`/api/v1/admin/contents/${item.id}/publish`, 'POST', { expectedVersion: item.version, metadataReviewed: true })
  item = await save(item, title, '# ' + title + '\n\n当前公开版本。\n\n![图](' + image.url + ')', image.url)
  item = await req(`/api/v1/admin/contents/${item.id}/publish`, 'POST', { expectedVersion: item.version, metadataReviewed: true })
  const publicBefore = await req('/api/v1/public/contents/ARTICLE/' + item.slug)
  item = await save(item, title, '# ' + title + '\n\n最新私密工作稿。', image.url)
  assert.equal((await anonymous.request.get(api + endpoint)).status(), 401)
  const other = await create('POST')
  await req(`/api/v1/admin/contents/${other.id}/revisions/${original.id}`, 'GET', undefined, 404)
  const page = await owner.newPage()
  await page.goto(studio)
  await page.locator('.content-row').filter({ hasText: title }).click()
  const button = page.getByRole('button', { name: '历史版本', exact: true })
  await button.click()
  const dialog = page.getByRole('dialog', { name: '历史版本' })
  await dialog.locator('.history-list button').first().waitFor()
  const revisionButton = () => dialog.locator('.history-list button').filter({ hasText: `v${original.articleVersion} · 保存` })
  await revisionButton().click()
  assert.equal(await dialog.getByLabel('历史正文').textContent(), oldBody)
  assert.equal(await page.evaluate(() => window.historyProbe), undefined, 'history preview is escaped text')
  await dialog.getByRole('button', { name: '恢复到工作稿', exact: true }).click()
  await dialog.getByRole('button', { name: '取消恢复', exact: true }).click()
  assert.equal((await req('/api/v1/admin/contents/' + item.id)).version, item.version)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.env.RAYCHI_HISTORY_E2E_SCREENSHOT) await dialog.screenshot({ path: process.env.RAYCHI_HISTORY_E2E_SCREENSHOT })
  await dialog.getByRole('button', { name: '恢复到工作稿', exact: true }).click()
  await dialog.getByRole('button', { name: '确认恢复工作稿', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByText('历史版本已恢复为工作稿，公开内容未改变。', { exact: true }).waitFor()
  item = await req('/api/v1/admin/contents/' + item.id)
  assert.equal(item.bodyMarkdown, oldBody)
  assert.deepEqual(await req('/api/v1/public/contents/ARTICLE/' + item.slug), publicBefore)
  assert.ok((await page.locator('[contenteditable="true"]').first().innerText()).includes('旧版本正文。'), 'restoring reloads the rich editor')
  assert.equal(await page.evaluate(() => window.historyProbe), undefined)
  assert.equal(await page.getByRole('button', { name: '导出已保存内容', exact: true }).isDisabled(), false, 'restored editor stays clean')
  assert.equal((await owner.request.get(api + '/api/v1/admin/assets/' + image.id + '/content')).status(), 200)
  assert.equal((await anonymous.request.get(api + image.url)).status(), 200)
  // Actual concurrent restores share a stale version: only one may commit.
  const before = (await req(endpoint)).total
  const responses = await Promise.all([0, 1].map(() => owner.request.post(api + endpoint + '/' + original.id + '/restore', {
    headers: { [csrf.headerName]: csrf.token }, data: { expectedVersion: item.version } })))
  assert.deepEqual(responses.map(response => response.status()).sort(), [200, 409])
  assert.equal((await req('/api/v1/admin/contents/' + item.id)).version, item.version + 1)
  assert.equal((await req(endpoint)).total, before + 1)
  assert.deepEqual(await req('/api/v1/public/contents/ARTICLE/' + item.slug), publicBefore)
  // Dirty editor cannot overwrite unsaved input from history.
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' 未保存')
  await button.click()
  await revisionButton().click()
  assert.equal(await dialog.getByRole('button', { name: '恢复到工作稿', exact: true }).isDisabled(), true)
  await dialog.getByRole('button', { name: '关闭历史' }).click()
  await page.reload()
  await page.locator('.content-row').filter({ hasText: title }).click()
  await button.click()
  await revisionButton().click()
  let fresh = await req('/api/v1/admin/contents/' + item.id)
  fresh = await save(fresh, title, fresh.bodyMarkdown + '\n\n其他会话修改。', image.url)
  await dialog.getByRole('button', { name: '恢复到工作稿', exact: true }).click()
  await dialog.getByRole('button', { name: '确认恢复工作稿', exact: true }).click()
  await dialog.getByRole('alert').getByText('文章已被更新，请刷新后重试。', { exact: true }).waitFor()
  assert.equal((await req('/api/v1/admin/contents/' + item.id)).version, fresh.version)
  await dialog.getByRole('button', { name: '关闭历史' }).click()
  // Explicitly simulated list outage verifies retry/close while actual revisions
  // and all writes above used the real service; no production data is touched.
  await page.route('**/admin/contents/*/revisions?page=**', route => route.fulfill({ status: 503,
    json: { code: 'UNAVAILABLE', message: '历史暂时不可用。' } }))
  await button.click()
  await dialog.getByRole('alert').getByText('历史暂时不可用。', { exact: true }).waitFor()
  await page.unroute('**/admin/contents/*/revisions?page=**')
  await dialog.getByRole('button', { name: '重新加载' }).click()
  await revisionButton().waitFor()
  await dialog.getByRole('button', { name: '关闭历史' }).click()
  // Real POST history and pagination; no Markdown title or model required.
  let post = await create('POST')
  post = await save(post, '帖子历史', '旧帖子工作稿。')
  const postEndpoint = `/api/v1/admin/contents/${post.id}/revisions`
  const postOriginal = (await req(postEndpoint)).items[0]
  for (let i = 0; i < 21; i++) post = await save(post, '帖子历史', '新帖子工作稿-' + i)
  assert.equal((await req(postEndpoint + '?page=2&pageSize=20')).items.length, 3)
  const restoredPost = await req(postEndpoint + '/' + postOriginal.id + '/restore', 'POST', { expectedVersion: post.version })
  assert.equal(restoredPost.bodyMarkdown, '旧帖子工作稿。')
  console.log('PASS draft history: real metadata/private detail, preview/escaped text/cancel/confirm, rich editor reset without dirty state, published snapshot and images unchanged, actual concurrent CAS/409, dirty disabled, list failure retry, POST/pagination, 390px')
} finally {
  for (const id of ids) {
    const current = await req('/api/v1/admin/contents/' + id).catch(() => null)
    if (current) await req(`/api/v1/admin/contents/${id}?expectedVersion=${current.version}`, 'DELETE', undefined, 204)
  }
  await browser.close()
}
