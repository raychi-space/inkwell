import { test, expect } from '@playwright/test'

test('filter refresh retains content and statistics until success, discards stale responses and preserves rows on error', async ({ page }) => {
  let release: (() => void) | undefined
  const article = { id: 'original', title: '原来的内容', type: 'ARTICLE', status: 'PUBLISHED', bodyMarkdown: '原正文', tags: [], category: '未分类', updatedAt: '2026-10-04T00:00:00Z' }
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname
    let body: unknown = {}
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) body = { siteName: '测试站点' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/contents')) {
      const type = url.searchParams.get('type')
      if (url.searchParams.get('sort') === 'oldest') {
        await route.fulfill({ status: 503, json: { message: '暂时无法加载', code: 'UNAVAILABLE' } }); return
      }
      if (type === 'POST') await new Promise<void>(resolve => { release = resolve })
      body = { items: [{ ...article, id: type ?? 'original', title: type === 'POST' ? '较慢的帖子结果' : type === 'ARTICLE' ? '最新文章结果' : '原来的内容' }], total: 1, page: 1, pageSize: 50 }
    } else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await expect(page.getByText('原来的内容', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: /^类型/ }).click()
  await page.getByRole('option', { name: '帖子', exact: true }).click()
  await expect(page.getByRole('status', { name: '正在加载内容' })).toBeVisible()
  await expect(page.getByText('原来的内容', { exact: true })).toBeVisible()
  await expect(page.locator('.content-list')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.content-list')).not.toContainText('正在加载')
  await page.getByRole('combobox', { name: /^类型/ }).click()
  await page.getByRole('option', { name: '文章', exact: true }).click()
  await expect(page.getByText('最新文章结果', { exact: true })).toBeVisible()
  release?.()
  await expect(page.getByRole('status', { name: '正在加载内容' })).toHaveCount(0)
  await page.getByRole('combobox', { name: /^排序/ }).click()
  await page.getByRole('option', { name: '最早更新', exact: true }).click()
  await expect(page.getByText('暂时无法加载', { exact: true })).toBeVisible()
  await expect(page.getByText('最新文章结果', { exact: true })).toBeVisible()
  await expect(page.getByText('较慢的帖子结果', { exact: true })).toHaveCount(0)
})
