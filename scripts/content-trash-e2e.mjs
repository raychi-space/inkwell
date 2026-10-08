/** Real recycle-bin lifecycle against disposable MySQL/API and production studio. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
assert.equal(process.env.RAYCHI_E2E_CONFIRM_ISOLATED, '1')
const credentials = JSON.parse(readFileSync(process.env.RAYCHI_TRASH_E2E_CREDENTIALS, 'utf8'))
const api = process.env.RAYCHI_E2E_API ?? credentials.api
const studio = process.env.RAYCHI_E2E_STUDIO ?? credentials.studio
const site = process.env.RAYCHI_E2E_SITE ?? credentials.site
const { chromium } = await import(pathToFileURL(process.env.RAYCHI_E2E_PLAYWRIGHT).href)
const browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {})
const owner = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } })
const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
const ids = []
let csrf
let page
async function req(path, method = 'GET', data, expected = 200) {
  const response = await owner.request.fetch(api + path, { method,
    headers: csrf ? { [csrf.headerName]: csrf.token } : {}, ...(data === undefined ? {} : { data }) })
  assert.equal(response.status(), expected, `${method} ${path}`)
  return expected === 204 ? undefined : response.json()
}
async function login() {
  csrf = await req('/api/v1/auth/csrf')
  await req('/api/v1/auth/login', 'POST', { username: credentials.username, password: credentials.password })
  csrf = await req('/api/v1/auth/csrf')
}
async function create(type) { const row = await req('/api/v1/admin/contents?type=' + type, 'POST', {}, 201); ids.push(row.id); return row }
async function save(row, title, body, coverUrl = null) {
  return req('/api/v1/admin/contents/' + row.id, 'PUT', { version: row.version, slug: row.slug, title,
    summary: title + '摘要', bodyMarkdown: body, tags: ['回收站验收'], coverUrl, category: row.category, publicationMetadata: true })
}
async function publicHidden(row, image) {
  assert.equal((await anonymous.request.get(api + '/api/v1/public/contents/ARTICLE/' + row.slug)).status(), 404)
  assert.equal((await anonymous.request.get(api + image.url)).status(), 404)
  const listing = await req('/api/v1/public/contents?pageSize=50')
  assert.ok(!listing.items.some(item => item.id === row.id))
  for (const path of ['/feed.xml', '/sitemap-1.xml']) {
    const response = await anonymous.request.get(site + path)
    assert.ok([200, 404].includes(response.status()), path)
    assert.ok(!(await response.text()).includes('/writing/' + row.slug), path + ' excludes trashed/draft content')
  }
}
try {
  await login()
  const title = '回收站验收-' + randomUUID().slice(0, 8)
  let item = await create('ARTICLE')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=', 'base64')
  const upload = await owner.request.post(api + `/api/v1/admin/articles/${item.id}/assets`, {
    headers: { [csrf.headerName]: csrf.token }, multipart: { file: { name: 'image.png', mimeType: 'image/png', buffer: png } } })
  assert.equal(upload.status(), 201)
  const image = await upload.json()
  item = await save(item, title, '# ' + title + '\n\n公开正文。\n\n![图](' + image.url + ')', image.url)
  item = await req(`/api/v1/admin/contents/${item.id}/publish`, 'POST', { expectedVersion: item.version, metadataReviewed: true })
  const publishedAt = item.publishedAt
  item = await save(item, title, '# ' + title + '\n\n私密工作稿。\n\n![图](' + image.url + ')', image.url)
  const beforeHistory = (await req(`/api/v1/admin/contents/${item.id}/revisions`)).total
  assert.equal((await anonymous.request.get(api + '/api/v1/admin/trash')).status(), 401)
  page = await owner.newPage()
  await page.goto(studio)
  await page.locator('.content-row').filter({ hasText: title }).click()
  const move = page.getByRole('button', { name: '移到回收站', exact: true })
  await move.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal((await req('/api/v1/admin/contents/' + item.id)).version, item.version)
  // A real write by another client produces an actual version conflict in the UI.
  item = await save(item, title, item.bodyMarkdown + '\n\n另一会话修改。', image.url)
  await move.click()
  await dialog.getByRole('button', { name: '确认移到回收站' }).click()
  await dialog.getByRole('alert').getByText('内容已改变，请重新加载后重试。', { exact: true }).waitFor()
  assert.equal((await req('/api/v1/admin/contents/' + item.id)).version, item.version)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.reload()
  await page.locator('.content-row').filter({ hasText: title }).click()
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.click(); await page.keyboard.press('End'); await page.keyboard.type(' 未保存')
  assert.equal(await move.isDisabled(), true)
  await page.reload()
  await page.locator('.content-row').filter({ hasText: title }).click()
  await move.click()
  await dialog.getByRole('button', { name: '确认移到回收站' }).click()
  await page.getByRole('heading', { name: '回收站', exact: true }).waitFor()
  let trashList = await req('/api/v1/admin/trash')
  let trashed = trashList.items.find(row => row.id === item.id)
  assert.ok(trashed)
  assert.equal(trashed.version, item.version + 1)
  assert.equal(trashed.bodyMarkdown, undefined)
  await req('/api/v1/admin/contents/' + item.id, 'GET', undefined, 404)
  await publicHidden(item, image)
  assert.deepEqual(await (await owner.request.get(api + '/api/v1/admin/assets/' + image.id + '/content')).body(), png)
  const row = page.locator('.trash-item').filter({ hasText: title })
  await row.getByRole('button', { name: '恢复为草稿', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal((await req('/api/v1/admin/trash')).items.find(row => row.id === item.id).version, trashed.version)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  if (process.env.RAYCHI_TRASH_E2E_SCREENSHOT) await page.screenshot({ path: process.env.RAYCHI_TRASH_E2E_SCREENSHOT })
  await row.getByRole('button', { name: '恢复为草稿', exact: true }).click()
  await dialog.getByRole('button', { name: '确认恢复为草稿' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '← 返回草稿箱', exact: true }).waitFor()
  await page.locator('[contenteditable="true"]').first().waitFor()
  // Assert durable draft/editor state below; optional assistant-load errors can
  // replace a transient notice in fixtures with the Agent bridge disabled.
  const restored = await req('/api/v1/admin/contents/' + item.id)
  assert.equal(restored.status, 'DRAFT')
  assert.equal(restored.bodyMarkdown, item.bodyMarkdown)
  assert.equal(restored.slug, item.slug)
  assert.equal(restored.publishedAt, publishedAt)
  assert.equal(restored.version, item.version + 2)
  assert.equal((await req(`/api/v1/admin/contents/${item.id}/revisions`)).total, beforeHistory + 3)
  assert.ok((await page.locator('[contenteditable="true"]').first().innerText()).includes('私密工作稿。'))
  assert.equal(await move.isDisabled(), false, 'restored editor remains clean')
  await publicHidden(restored, image)
  item = await req(`/api/v1/admin/contents/${item.id}/publish`, 'POST', { expectedVersion: restored.version, metadataReviewed: true })
  assert.equal((await anonymous.request.get(api + image.url)).status(), 200)
  assert.ok((await req('/api/v1/public/contents/ARTICLE/' + item.slug)).bodyMarkdown.includes('私密工作稿。'))
  // Actual simultaneous recycle-bin restores use the same version and commit once.
  trashed = await req(`/api/v1/admin/contents/${item.id}/trash`, 'POST', { expectedVersion: item.version })
  const responses = await Promise.all([0, 1].map(() => owner.request.post(api + `/api/v1/admin/trash/${item.id}/restore`, {
    headers: { [csrf.headerName]: csrf.token }, data: { expectedVersion: trashed.version } })))
  assert.deepEqual(responses.map(response => response.status()).sort(), [200, 409])
  item = await req('/api/v1/admin/contents/' + item.id)
  assert.equal(item.version, trashed.version + 1)
  trashed = await req(`/api/v1/admin/contents/${item.id}/trash`, 'POST', { expectedVersion: item.version })
  await page.reload()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await row.getByRole('button', { name: '永久删除', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.ok((await req('/api/v1/admin/trash')).items.some(row => row.id === item.id))
  await row.getByRole('button', { name: '永久删除', exact: true }).click()
  await dialog.getByRole('button', { name: '确认永久删除' }).click()
  await page.getByText('已永久删除该内容。', { exact: true }).waitFor()
  await req('/api/v1/admin/contents/' + item.id, 'GET', undefined, 404)
  assert.equal((await owner.request.get(api + '/api/v1/admin/assets/' + image.id + '/content')).status(), 404)
  // Real POST pagination and long title wrapping. Failure below is explicitly injected.
  for (let i = 0; i < 21; i++) {
    let post = await create('POST')
    post = await save(post, '分页帖子-' + i + '-' + 'x'.repeat(120), '回收分页正文。')
    await req(`/api/v1/admin/contents/${post.id}/trash`, 'POST', { expectedVersion: post.version })
  }
  await page.route('**/admin/trash?page=**', route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: '回收站暂时不可用。' } }))
  await page.getByRole('button', { name: '草稿箱', exact: true }).click()
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await page.getByRole('alert').getByText('回收站暂时不可用。', { exact: true }).waitFor()
  await page.unroute('**/admin/trash?page=**')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.locator('.trash-item').first().waitFor()
  assert.equal(await page.locator('.trash-item').count(), 20)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByText(/第 2 页/).waitFor()
  assert.ok(await page.locator('.trash-item').count() >= 1)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'long ASCII titles wrap')
  await req('/api/v1/auth/logout', 'POST', {}, 204)
  await page.getByRole('button', { name: '草稿箱', exact: true }).click()
  await page.getByLabel('站长账号').waitFor()
  console.log('PASS recycle bin: actual trash/restore/purge, confirmation cancel/Escape, draft/public/feed/sitemap/image/history isolation, concurrent CAS/409, dirty disabled, real pagination, injected retry, session expiry, 390px/long titles')
} catch (error) {
  if (page) {
    console.error('UI notices:', await page.locator('.notice').allTextContents())
    console.error('UI dialogs:', await page.getByRole('dialog').allTextContents())
    if (process.env.RAYCHI_TRASH_E2E_SCREENSHOT) await page.screenshot({ path: process.env.RAYCHI_TRASH_E2E_SCREENSHOT.replace('.png', '-failure.png') })
  }
  throw error
} finally {
  try {
    await login()
    for (const id of ids) {
      const response = await owner.request.get(api + '/api/v1/admin/contents/' + id)
      if (response.status() === 200) {
        const row = await response.json()
        await req('/api/v1/admin/contents/' + id + '?expectedVersion=' + row.version, 'DELETE', undefined, 204)
      } else {
        // Locate only this fixture's IDs, never purge unrelated data.
        for (let page = 1; ; page++) {
          const list = await req('/api/v1/admin/trash?page=' + page + '&pageSize=50')
          const row = list.items.find(row => row.id === id)
          if (row) { await req('/api/v1/admin/trash/' + id + '?expectedVersion=' + row.version, 'DELETE', undefined, 204); break }
          if (page * 50 >= list.total) break
        }
      }
    }
  } finally { await owner.close(); await anonymous.close(); await browser.close() }
}
