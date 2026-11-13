import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const dashboard = JSON.parse(
  readFileSync(new URL('./fixtures/reading-dashboard.json', import.meta.url), 'utf8'),
)
const item = {
  id: 'one',
  title: '示例文章',
  bodyMarkdown: '正文',
  type: 'ARTICLE',
  status: 'PUBLISHED',
  hasUnpublishedChanges: true,
  updatedAt: '2026-11-13T00:00:00Z',
  tags: [],
  version: 1,
  slug: 'example',
  summary: '',
  category: null,
  coverUrl: null,
  createdAt: '2026-11-13T00:00:00Z',
  publishedAt: '2026-11-13T00:00:00Z',
  publicUpdatedAt: '2026-11-13T00:00:00Z',
}

async function fixture(
  page: Page,
  options: { analyticsError?: boolean; readingConfigured?: boolean; enabled?: boolean } = {},
) {
  const methods: string[] = []
  const contentQueries: string[] = []
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    methods.push(request.method() + ' ' + path)
    let body: unknown
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/analytics/settings'))
      body = { enabled: options.enabled ?? true, configured: true, version: 0 }
    else if (path.endsWith('/analytics/overview')) {
      if (options.analyticsError)
        return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } })
      body = {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        summary: { todayPageViews: 24, todayVisitors: 8, pageViews: 100, visitors: 50 },
        trend: [
          { day: '2026-11-12', pageViews: 10 },
          { day: '2026-11-13', pageViews: 24 },
        ],
        countries: [],
        provinces: [],
        cities: [],
        sources: [],
      }
    } else if (path.endsWith('/reading/integration'))
      body = { mode: 'aihot', managementConfigured: options.readingConfigured ?? true }
    else if (path.endsWith('/aihot/dashboard')) body = dashboard
    else if (path.endsWith('/settings')) body = { siteName: '测试站点' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/ai/assistants')) body = { items: [] }
    else if (path.endsWith('/contents') && request.method() === 'POST')
      body = { ...item, id: 'new', type: 'POST', status: 'DRAFT', title: '', publishedAt: null }
    else if (path.endsWith('/contents')) {
      contentQueries.push(url.search)
      const status = url.searchParams.get('status')
      body = {
        items: status ? [] : [item],
        total: status === 'PUBLISHED' ? 123 : status === 'DRAFT' ? 9 : 132,
        page: 1,
        pageSize: Number(url.searchParams.get('pageSize')),
      }
    } else if (path.endsWith('/contents/one')) body = item
    else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  return { methods, contentQueries }
}

test('overview is the initial page and uses global totals, read-only refresh, and interactive trend', async ({
  page,
}) => {
  const { methods, contentQueries } = await fixture(page)
  await expect(page.getByRole('heading', { name: '概览', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '概览', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  for (const [index, value] of ['24', '8', '123', '9'].entries())
    await expect(page.locator('.overview-metrics section').nth(index)).toContainText(value)
  await expect(page.locator('.overview-recent')).toContainText('有未发布修改')
  await expect(page.locator('.overview-reading')).toContainText('待处理')
  expect(
    contentQueries.some((q) => q.includes('status=PUBLISHED') && q.includes('pageSize=1')),
  ).toBe(true)
  expect(contentQueries.some((q) => q.includes('status=DRAFT') && q.includes('pageSize=1'))).toBe(
    true,
  )
  const chart = page.getByRole('img', { name: /每日访问量/ })
  await chart.focus()
  await chart.press('End')
  await expect(page.getByRole('tooltip')).toContainText('24 PV')
  await chart.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.locator('.overview-metrics')).toContainText('123')
  expect(methods.every((entry) => entry.startsWith('GET '))).toBe(true)
  await expect
    .poll(() => methods.filter((entry) => entry.includes('/aihot/dashboard')).length)
    .toBe(2)
  await page.getByRole('button', { name: '内容管理 →' }).click()
  await expect(page.getByRole('heading', { name: '内容管理', exact: true })).toBeVisible()
})

test('recent content opens in the editor and the new post action creates a draft', async ({
  page,
}) => {
  const { methods } = await fixture(page)
  await page.getByRole('button', { name: /示例文章/ }).click()
  await expect(page.getByRole('button', { name: /返回内容管理/ })).toBeVisible()
  expect(methods).toContain('GET /api/v1/admin/contents/one')
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await page.getByRole('button', { name: '＋ 写帖子' }).click()
  await expect(page.getByRole('textbox', { name: '正文 Markdown' })).toBeVisible()
  expect(methods).toContain('POST /api/v1/admin/contents')
})

test('independent failures and disabled or unconfigured features do not look like zero', async ({
  page,
}) => {
  const { methods } = await fixture(page, {
    analyticsError: true,
    readingConfigured: false,
    enabled: false,
  })
  await expect(page.getByText('访问统计暂时无法读取')).toBeVisible()
  await expect(page.getByText('访问统计已关闭')).toBeVisible()
  await expect(page.getByText('拾阅管理尚未配置')).toBeVisible()
  await expect(page.locator('.overview-metrics section').first()).toContainText('—')
  await expect(page.locator('.overview-metrics')).toContainText('123')
  expect(methods.some((entry) => entry.includes('/aihot/dashboard'))).toBe(false)
})

for (const width of [1280, 390, 320]) {
  test(`overview fits and can scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 })
    await fixture(page)
    await expect(page.getByRole('heading', { name: '最近内容' })).toBeAttached()
    await page.getByRole('heading', { name: '最近内容' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { name: '最近内容' })).toBeInViewport()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
}
