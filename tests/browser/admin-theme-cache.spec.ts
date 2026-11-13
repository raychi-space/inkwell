import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const dashboard = JSON.parse(readFileSync(new URL('./fixtures/reading-dashboard.json', import.meta.url), 'utf8'))
const sources = JSON.parse(readFileSync(new URL('./fixtures/reading-sources.json', import.meta.url), 'utf8'))
const settings = { version: 0, siteName: '测试站点', intro: '', avatarUrl: null, contacts: [], accounts: [], socialAccounts: [], projectIntro: '', navigation: [], homeSections: [], homepage: { focus: '', projects: [], recentSections: [], bottomSections: [] } }
async function fixture(page: Page) {
  const reads: string[] = []
  let username = 'first', site = { ...settings }
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (request.method() === 'GET') reads.push(url.pathname + url.search)
    let body: unknown
    if (path.endsWith('/auth/session')) body = { authenticated: true, username }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/analytics/settings')) body = { enabled: true, configured: true, version: 0 }
    else if (path.endsWith('/analytics/overview')) body = { summary: { pageViews: 20, visitors: 10, todayPageViews: 3, todayVisitors: 2 }, trend: [], countries: [], provinces: [], cities: [], sources: [] }
    else if (path.endsWith('/analytics/events')) body = { items: [], page: Number(url.searchParams.get('page')), pageSize: 20, total: 0 }
    else if (path.endsWith('/reading/integration')) body = { mode: 'aihot', managementConfigured: true }
    else if (path.endsWith('/aihot/dashboard')) body = dashboard
    else if (path.endsWith('/aihot/sources')) body = sources
    else if (path.endsWith('/settings')) {
      if (request.method() === 'PUT') site = { ...request.postDataJSON(), version: site.version + 1 }
      body = site
    }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/ai/providers')) body = { items: [{ id: 'fixture-provider', name: 'OpenAI', enabled: true, type: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', models: ['fixture'], version: 0, hasApiKey: false, apiKeyMask: null }] }
    else if (path.endsWith('/ai/assistants')) body = { items: [] }
    else if (path.endsWith('/contents/one')) body = { id: 'one', version: 1, title: '写作示例', slug: 'one', summary: '', type: 'ARTICLE', status: 'DRAFT', bodyMarkdown: '# 写作示例\n\n正文与 **加粗**，还有 `代码`。\n\n```js\nconst answer = 42\n```', tags: [], category: '未分类', createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', coverUrl: null }
    else if (path.endsWith('/contents')) body = {
      items: [{ id: 'one', title: username + ' 的内容', type: 'ARTICLE', status: 'PUBLISHED', bodyMarkdown: '正文', tags: [], category: '未分类', updatedAt: '2026-11-13T00:00:00Z' }],
      total: 120, page: Number(url.searchParams.get('page')), pageSize: Number(url.searchParams.get('pageSize')),
    }
    else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await expect(page.locator('.overview-metrics')).toContainText('120')
  return { reads, setUser: (value: string) => { username = value } }
}
async function go(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}

test('warm default, dark and system preferences apply to surfaces and survive reload', async ({ page }) => {
  await fixture(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm')
  await page.getByRole('button', { name: /，账户菜单$/ }).click()
  await page.getByRole('combobox', { name: '管理台主题' }).selectOption('dark')
  await expect(page.locator('html')).toHaveClass(/dark-theme/)
  expect(await page.locator('.dashboard-card').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(41, 49, 43)')
  await page.keyboard.press('Escape')
  await go(page, '网站管理')
  await expect(page.locator('.provider-logo img').first()).toBeAttached()
  expect(await page.locator('.provider-logo img').first().evaluate(el => getComputedStyle(el).filter)).toBe('invert(0.88)')
  await go(page, '概览')
  await page.screenshot({ path: 'test-results/admin-dark.png', fullPage: true })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: /，账户菜单$/ }).click()
  await page.getByRole('combobox', { name: '管理台主题' }).selectOption('system')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('combobox', { name: '管理台主题' }).selectOption('warm')
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/admin-warm.png', fullPage: true })
})

test('switching sections reuses reads, keeps filters/pages and explicit refresh fetches anew', async ({ page }) => {
  const { reads } = await fixture(page)
  await go(page, '内容管理')
  await expect(page.getByText('first 的内容', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第 2 页', { exact: true })).toBeVisible()
  const contentReads = () => reads.filter(path => path.startsWith('/api/v1/admin/contents?') && path.includes('pageSize=50')).length
  const before = contentReads()
  await go(page, '草稿箱')
  await go(page, '内容管理')
  await expect(page.getByText('第 2 页', { exact: true })).toBeVisible()
  expect(contentReads()).toBe(before + 1) // Draft list only.
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(contentReads).toBe(before + 2)
  await go(page, '网站管理')
  await expect(page.getByLabel('站名', { exact: true })).toHaveValue('测试站点')
  await expect.poll(() => reads.filter(path => path.endsWith('/ai/providers')).length).toBe(1)
  const settingsReads = reads.filter(path => path === '/api/v1/admin/settings').length
  await go(page, '助手管理')
  await go(page, '网站管理')
  await expect(page.getByLabel('站名', { exact: true })).toHaveValue('测试站点')
  expect(reads.filter(path => path === '/api/v1/admin/settings')).toHaveLength(settingsReads)
  expect(reads.filter(path => path.endsWith('/ai/providers'))).toHaveLength(1)
  await page.getByLabel('站名', { exact: true }).fill('保存的新站名')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('站点设置已保存，访客刷新后即可看到。')).toBeVisible()
  await go(page, '内容管理')
  await expect.poll(contentReads).toBe(before + 3)
  await go(page, '拾阅管理')
  await page.getByRole('tab', { name: '采集来源' }).click()
  await expect(page.locator('.reading-table')).toBeVisible()
  const count = reads.filter(path => path.includes('/aihot/sources?')).length
  await go(page, '概览')
  await go(page, '拾阅管理')
  await expect(page.getByRole('tab', { name: '采集来源' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.reading-table')).toBeVisible()
  expect(reads.filter(path => path.includes('/aihot/sources?'))).toHaveLength(count)
  await page.getByRole('button', { name: '手动刷新', exact: true }).click()
  await expect.poll(() => reads.filter(path => path.includes('/aihot/sources?')).length).toBe(count + 1)
})

test('cookie account changes discard cached data and navigation state', async ({ page }) => {
  const { reads, setUser } = await fixture(page)
  await go(page, '内容管理')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第 2 页', { exact: true })).toBeVisible()
  const before = reads.filter(path => path.startsWith('/api/v1/admin/contents?')).length
  setUser('second')
  await go(page, '概览')
  await expect(page.getByRole('button', { name: 'second，账户菜单' })).toBeVisible()
  await go(page, '内容管理')
  await expect(page.getByText('second 的内容', { exact: true })).toBeVisible()
  await expect(page.getByText('第 1 页', { exact: true })).toBeVisible()
  expect(reads.filter(path => path.startsWith('/api/v1/admin/contents?')).length).toBeGreaterThan(before)
})


test('dark writing surfaces, toolbar and code blocks keep readable foregrounds', async ({ page }) => {
  await fixture(page)
  await page.getByRole('button', { name: /，账户菜单$/ }).click()
  await page.getByRole('combobox', { name: '管理台主题' }).selectOption('dark')
  await page.keyboard.press('Escape')
  await go(page, '内容管理')
  await page.getByRole('button', { name: /first 的内容/ }).click()
  await expect(page.locator('[contenteditable=true]').first()).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark-theme/)
  expect(await page.locator('[contenteditable=true]').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(220, 227, 218)')
  expect(await page.locator('.editable-prose p code span').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(51, 60, 53)')
  expect(await page.locator('.mdxeditor [role=combobox]').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(41, 49, 43)')
  await page.screenshot({ path: 'test-results/admin-editor-dark.png', fullPage: true })
})
