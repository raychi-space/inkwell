import { installOverviewFixture, waitForOverview } from './overview-fixture'
import { expect, test, type Page } from '@playwright/test'

async function fixture(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'layout-fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) body = { siteName: '测试站点' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/trash')) body = { total: 40, page: 1, pageSize: 20, items: Array.from({ length: 20 }, (_, i) => ({ id: 'trash-' + i, type: 'ARTICLE', title: '回收站内容 ' + (i + 1), trashedAt: '2026-11-07T00:00:00Z', version: 1 })) }
    else if (path.endsWith('/contents')) body = { items: [], total: 0, page: 1, pageSize: 50 }
    else throw Error('Unexpected layout fixture API: ' + path)
    await route.fulfill({ json: body })
  })
  await installOverviewFixture(page)
  await page.goto('/')
  await waitForOverview(page)
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '内容管理', exact: true })).toBeVisible()
}

test('password actions remain reachable by wheel on a short desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 440 })
  await fixture(page)
  await page.getByRole('button', { name: /，账户菜单$/ }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  await expect(page.getByLabel('确认新密码', { exact: true })).toBeAttached()
  const header = await page.locator('main .dashboard-head').boundingBox()
  await page.mouse.move(700, 320)
  await page.mouse.wheel(0, 1500)
  await expect(page.getByRole('button', { name: '修改密码并退出', exact: true })).toBeInViewport({ ratio: 1 })
  expect((await page.locator('main .dashboard-head').boundingBox())!.y).toBe(header!.y)
})

test('a full trash page scrolls independently and keeps pagination reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await fixture(page)
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await expect(page.locator('.trash-item')).toHaveCount(20)
  const header = await page.locator('main .dashboard-head').boundingBox()
  await page.mouse.move(800, 400)
  await page.mouse.wheel(0, 5000)
  await expect.poll(() => page.locator('.trash-list').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: '回收站内容 20', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeInViewport({ ratio: 1 })
  expect((await page.locator('main .dashboard-head').boundingBox())!.y).toBe(header!.y)
})
