import { expect, test, type Page } from '@playwright/test'
import { installOverviewFixture, waitForOverview } from './overview-fixture'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const settings = { version: 1, siteName: '测试站点', avatarUrl: null }
const article = { id: 'published', title: '已发布文章', type: 'ARTICLE', status: 'PUBLISHED', bodyMarkdown: '正文', tags: ['used'], category: '未分类', hasUnpublishedChanges: true, updatedAt: '2026-11-15T00:00:00Z' }
const draft = { ...article, id: 'draft', title: '未发布草稿', status: 'DRAFT', hasUnpublishedChanges: false }
async function fixture(page: Page, options: { avatarConflict?: boolean } = {}) {
  const writes: { path: string; method: string; body: string | null }[] = []
  let loggedIn = true
  let catalog = [
    { name: 'unused', draftCount: 0, publicCount: 0, trashCount: 0, historyCount: 0, referenceCount: 0, protectedName: false },
    { name: 'used', draftCount: 1, publicCount: 1, trashCount: 0, historyCount: 1, referenceCount: 1, protectedName: false },
  ]
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method()
    if (method !== 'GET') writes.push({ path, method, body: req.postData() })
    let body: unknown
    if (path.endsWith('/auth/session')) body = { authenticated: loggedIn, username: loggedIn ? 'fixture' : null }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/auth/username') || path.endsWith('/auth/password')) { loggedIn = false; return route.fulfill({ status: 204 }) }
    else if (path.endsWith('/profile/avatar')) {
      if (options.avatarConflict) return route.fulfill({ status: 409, json: { code: 'SETTINGS_VERSION_CONFLICT', message: '设置已被更新，请刷新后重试。' } })
      body = { ...settings, version: 2, avatarUrl: 'data:image/png;base64,'+png.toString('base64') }
    } else if (path.endsWith('/settings')) body = settings
    else if (path.endsWith('/taxonomy/tags/references')) body = [{ id: 'published', title: '已发布文章', status: 'PUBLISHED' }]
    else if (path.endsWith('/taxonomy/tags')) {
      if (method === 'PUT') catalog = catalog.map(v => v.name === req.postDataJSON().name ? { ...v, name: req.postDataJSON().newName } : v)
      if (method === 'DELETE') catalog = catalog.filter(v => v.name !== url.searchParams.get('name'))
      if (method !== 'GET') return route.fulfill({ status: 204 })
      body = catalog
    } else if (path.endsWith('/tags') && method === 'POST') {
      catalog.push({ ...catalog[0], name: req.postDataJSON().name }); body = req.postDataJSON()
    } else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/contents')) {
      const all = [article, draft].filter(v => !url.searchParams.get('status') || v.status === url.searchParams.get('status'))
      body = { items: all, total: all.length, page: Number(url.searchParams.get('page')), pageSize: 50 }
    } else if (path.endsWith('/contents/published')) body = { ...article, version: 1, slug: 'example', summary: '', coverUrl: null }
    else if (path.endsWith('/ai/assistants')) body = { items: [] }
    else throw Error('Unexpected fixture API ' + method + ' ' + path)
    await route.fulfill({ json: body })
  })
  await installOverviewFixture(page)
  await page.goto('/'); await waitForOverview(page)
  return writes
}

test('sidebar order and unified content states, drafts, and unpublished modifications', async ({ page }) => {
  await fixture(page)
  await expect(page.locator('.studio-nav button')).toHaveText(['概览','内容管理','访问统计','拾阅管理','网站管理','助手管理','回收站','个人设置'])
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await expect(page.locator('.content-row')).toHaveCount(2)
  await expect(page.locator('.content-row').first()).toContainText('有未发布修改')
  await page.getByRole('combobox', { name: /^状态/ }).click()
  await page.getByRole('option', { name: '草稿', exact: true }).click()
  await expect(page.locator('.content-row')).toHaveCount(1)
  await expect(page.locator('.content-row')).toContainText('未发布草稿')
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await expect(page.getByRole('combobox', { name: /^状态/ })).toContainText('草稿')
})

test('avatar previews locally, protects unsaved selection and updates shared avatar only after save', async ({ page }) => {
  const writes = await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await page.getByLabel('选择头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveAttribute('src', /^blob:/)
  expect(writes).toHaveLength(0)
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '个人设置', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存头像', exact: true }).click()
  await expect(page.getByText('头像已保存。', { exact: true })).toBeVisible()
  await expect(page.locator('.account-avatar img')).toHaveAttribute('src', /^data:image/)
  expect(writes.filter(v => v.path.endsWith('/profile/avatar'))).toHaveLength(1)
  await expect(page.getByRole('button', { name: '保存头像', exact: true })).toBeDisabled()
  await page.screenshot({ path: 'test-results/personal-avatar.png', fullPage: true })
})

test('avatar conflicts retain preview for retry and never update the displayed saved avatar', async ({ page }) => {
  await fixture(page, { avatarConflict: true })
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await page.getByLabel('选择头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: '保存头像', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('设置已被更新')
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveAttribute('src', /^blob:/)
  await expect(page.locator('.account-avatar img')).toHaveCount(0)
  await page.getByRole('form', { name: '头像设置' }).getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveCount(0)
})

test('username change verifies password, submits only once and returns to login', async ({ page }) => {
  const writes = await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await page.getByLabel('用户名', { exact: true }).fill('new-admin')
  await page.getByRole('form', { name: '用户名设置' }).getByLabel('当前密码', { exact: true }).fill('current-password')
  await page.getByRole('button', { name: '修改用户名并退出', exact: true }).click()
  await expect(page.getByText('用户名已修改，请使用新用户名重新登录。')).toBeVisible()
  expect(writes.filter(v => v.path.endsWith('/auth/username'))).toHaveLength(1)
  expect(JSON.parse(writes[0].body!)).toEqual({ username: 'new-admin', currentPassword: 'current-password' })
  await expect(page.getByLabel('站长账号', { exact: true })).toHaveValue('')
})

test('password settings retain matching validation and log out only after success', async ({ page }) => {
  const writes = await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await page.getByRole('form', { name: '密码设置' }).getByLabel('当前密码', { exact: true }).fill('current-password')
  await page.getByLabel('新密码', { exact: true }).fill('replacement-password')
  await page.getByLabel('确认新密码', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: '修改密码并退出', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(writes).toHaveLength(0)
  await page.getByLabel('确认新密码', { exact: true }).fill('replacement-password')
  await page.getByRole('button', { name: '修改密码并退出', exact: true }).click()
  await expect(page.getByText('密码已修改，请使用新密码重新登录。')).toBeVisible()
})

test('catalog manages unused names, protects references, searches and opens associated content', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await page.getByRole('button', { name: '标签', exact: true }).click()
  const used = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'used', exact: true }) })
  await expect(used.getByRole('button', { name: '删除', exact: true })).toBeDisabled()
  await expect(used.getByRole('button', { name: '重命名', exact: true })).toBeDisabled()
  await page.getByLabel('新增标签', { exact: true }).fill('fresh')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const fresh = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'fresh', exact: true }) })
  await fresh.getByRole('button', { name: '重命名', exact: true }).click()
  await page.getByLabel('新名称', { exact: true }).fill('renamed')
  await expect(page.getByLabel('新增标签', { exact: true })).toBeDisabled()
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '内容', exact: true }).click()
  await expect(page.getByLabel('新名称', { exact: true })).toHaveValue('renamed')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  const renamed = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'renamed', exact: true }) })
  await expect(renamed).toBeVisible()
  page.once('dialog', d => d.accept())
  await renamed.getByRole('button', { name: '删除', exact: true }).click()
  await expect(renamed).toHaveCount(0)
  await page.getByLabel('搜索标签', { exact: true }).fill('used')
  await used.getByRole('button', { name: '查看引用（1）', exact: true }).click()
  await page.getByRole('button', { name: '已发布文章 · 已发布', exact: true }).click()
  await expect(page.getByRole('button', { name: '← 返回内容管理', exact: true })).toBeVisible()
})

for (const width of [1280,390,320]) test(`personal and catalog forms stay usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 540 })
  await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  for (const name of ['头像设置', '用户名设置', '密码设置']) {
    const form = page.getByRole('form', { name, exact: true })
    await expect.poll(() => form.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  }
  await page.getByRole('button', { name: '修改密码并退出', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: '修改密码并退出', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await page.getByRole('button', { name: '标签', exact: true }).click()
  await expect(page.getByRole('heading', { name: '标签管理', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `test-results/taxonomy-${width}.png`, fullPage: true })
})

test('personal settings show three sections together and each cancel preserves other inputs', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '个人设置页签' })).toHaveCount(0)
  const avatar = page.getByRole('form', { name: '头像设置' })
  const username = page.getByRole('form', { name: '用户名设置' })
  const password = page.getByRole('form', { name: '密码设置' })
  await expect(avatar).toBeAttached(); await expect(username).toBeAttached(); await expect(password).toBeAttached()
  await username.getByLabel('用户名', { exact: true }).fill('unsaved-name')
  await password.getByLabel('新密码', { exact: true }).fill('unsaved-password')
  await avatar.getByLabel('选择头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await avatar.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveCount(0)
  await expect(username.getByLabel('用户名', { exact: true })).toHaveValue('unsaved-name')
  await expect(password.getByLabel('新密码', { exact: true })).toHaveValue('unsaved-password')
  await password.getByRole('button', { name: '取消', exact: true }).click()
  await expect(password.getByLabel('新密码', { exact: true })).toHaveValue('')
  await expect(username.getByLabel('用户名', { exact: true })).toHaveValue('unsaved-name')
  await avatar.getByLabel('选择头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await username.getByRole('button', { name: '取消', exact: true }).click()
  await expect(username.getByLabel('用户名', { exact: true })).toHaveValue('fixture')
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveAttribute('src', /^blob:/)
})

test('avatar accepts exactly 5 MiB and rejects one extra byte before uploading', async ({ page }) => {
  const writes = await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  const avatar = page.getByRole('form', { name: '头像设置' })
  const maximum = Buffer.alloc(5 * 1024 * 1024); png.copy(maximum)
  await avatar.getByLabel('选择头像').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(maximum.length + 1) })
  await expect(avatar.getByRole('status')).toContainText('5 MiB')
  await expect(avatar.getByRole('button', { name: '保存头像', exact: true })).toBeDisabled()
  expect(writes).toHaveLength(0)
  await avatar.getByLabel('选择头像').setInputFiles({ name: 'boundary.png', mimeType: 'image/png', buffer: maximum })
  await expect(page.getByRole('img', { name: '头像预览' })).toHaveAttribute('src', /^blob:/)
  await expect(avatar.getByRole('button', { name: '保存头像', exact: true })).toBeEnabled()
  expect(writes).toHaveLength(0)
  await avatar.getByRole('button', { name: '保存头像', exact: true }).click()
  await expect(avatar.getByRole('status')).toHaveText('头像已保存。')
  expect(writes).toHaveLength(1)
})

test('credential changes protect other drafts; avatar save blocks other forms and preserves their drafts', async ({ page }) => {
  const writes = await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  const avatar = page.getByRole('form', { name: '头像设置' })
  const username = page.getByRole('form', { name: '用户名设置' })
  const password = page.getByRole('form', { name: '密码设置' })
  await avatar.getByLabel('选择头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png })
  await username.getByLabel('用户名', { exact: true }).fill('unsaved-name')
  await username.getByLabel('当前密码', { exact: true }).fill('current-password')
  page.once('dialog', d => d.dismiss())
  await username.getByRole('button', { name: '修改用户名并退出', exact: true }).click()
  expect(writes).toHaveLength(0)
  await password.getByLabel('当前密码', { exact: true }).fill('current-password')
  await password.getByLabel('新密码', { exact: true }).fill('replacement-password')
  await password.getByLabel('确认新密码', { exact: true }).fill('replacement-password')
  page.once('dialog', d => d.dismiss())
  await password.getByRole('button', { name: '修改密码并退出', exact: true }).click()
  expect(writes).toHaveLength(0)
  let release: (() => void) | undefined
  await page.route('**/api/v1/admin/profile/avatar', async route => {
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { ...settings, version: 2, avatarUrl: 'data:image/png;base64,'+png.toString('base64') } })
  })
  await avatar.getByRole('button', { name: '保存头像', exact: true }).click()
  await expect(username.getByLabel('用户名', { exact: true })).toBeDisabled()
  await expect(password.getByRole('button', { name: '修改密码并退出', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeDisabled()
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(avatar.getByRole('status')).toHaveText('头像已保存。')
  await expect(username.getByLabel('用户名', { exact: true })).toHaveValue('unsaved-name')
  await expect(password.getByLabel('新密码', { exact: true })).toHaveValue('replacement-password')
})


test('personal text inputs share themed focus and disabled states', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: '个人设置', exact: true }).click()
  const username = page.getByRole('form', { name: '用户名设置' }).getByLabel('用户名', { exact: true })
  await expect(page.locator('.personal-settings input.studio-input:not([type=file])')).toHaveCount(5)
  const unfocused = await username.evaluate(el => getComputedStyle(el).boxShadow)
  await username.focus()
  await expect(username).toBeFocused()
  await expect.poll(() => username.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe(unfocused)
  const initial = await username.evaluate(el => getComputedStyle(el).backgroundColor)
  await page.getByRole('combobox', { name: /管理台主题/ }).click()
  await page.getByRole('option', { name: '深色', exact: true }).click()
  await expect.poll(() => username.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(initial)
  const refresh = page.getByRole('button', {name:'刷新', exact:true})
  await expect.poll(() => refresh.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(41, 49, 43)')
  await page.screenshot({ path: 'test-results/personal-input-dark.png', fullPage: true })
})
