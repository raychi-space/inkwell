import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page, options: { configured?: boolean; failure?: number } = {}) {
  let settings = { enabled: true, configured: options.configured ?? true, version: 0 }
  let failWrite = options.failure ?? 0
  const writes: unknown[] = []
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let body: unknown
    if (path.endsWith('/analytics/settings')) {
      if (request.method() === 'PUT') {
        expect(request.headers()['x-csrf-token']).toBe('fixture')
        writes.push(request.postDataJSON())
        if (failWrite) {
          const status = failWrite; failWrite = 0
          await route.fulfill({ status, json: { code: status === 409 ? 'ANALYTICS_SETTINGS_VERSION_CONFLICT' : 'UNAVAILABLE', message: '设置保存失败，请重新加载。' } })
          return
        }
        expect(request.postDataJSON().version).toBe(settings.version)
        settings = { ...settings, enabled: request.postDataJSON().enabled, version: settings.version + 1 }
      }
      body = settings
    } else if (path.endsWith('/analytics/report')) {
      const query = new URL(request.url()).searchParams
      body = { from: query.get('from'), to: query.get('to'), pageViews: 12, unidentifiedPageViews: 2, visitorDays: 4, visits: 5, trend: [], sources: [], popularPaths: [], retention: { rawDays: 30, aggregateDays: 365 } }
    } else if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) body = { siteName: '测试站点' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/contents')) body = { items: [], total: 0, page: 1, pageSize: 50 }
    else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '访问统计', exact: true }).click()
  return writes
}

test('admin can disable collection, keep reports, reload the saved preference and re-enable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const writes = await fixture(page)
  const control = page.getByRole('switch', { name: '访问采集' })
  await expect(control).toBeChecked()
  await control.click()
  await expect(control).not.toBeChecked()
  await expect(page.getByText('已关闭访问采集。', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '页面浏览 PV' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '访问统计', exact: true }).click()
  await expect(control).not.toBeChecked()
  await control.click()
  await expect(control).toBeChecked()
  expect(writes).toEqual([{ enabled: false, version: 0 }, { enabled: true, version: 1 }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

for (const failure of [409, 503]) {
  test(`failed save (${failure}) requires reloading the authoritative preference before retry`, async ({ page }) => {
    const writes = await fixture(page, { failure })
    const control = page.getByRole('switch', { name: '访问采集' })
    await expect(control).toBeChecked()
    await control.click()
    await expect(page.getByRole('alert').filter({ hasText: '设置保存失败' })).toBeVisible()
    await expect(control).toBeDisabled()
    await page.getByRole('button', { name: '重新加载设置' }).click()
    await expect(control).toBeChecked()
    await control.click()
    await expect(control).not.toBeChecked()
    expect(writes).toHaveLength(2)
  })
}

test('unconfigured analytics cannot be enabled by the control', async ({ page }) => {
  const writes = await fixture(page, { configured: false })
  await expect(page.getByRole('switch', { name: '访问采集' })).toBeDisabled()
  await expect(page.getByText('访问统计尚未配置，暂时无法开启。')).toBeVisible()
  expect(writes).toEqual([])
})
