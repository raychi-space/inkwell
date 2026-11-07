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
    } else if (path.endsWith('/analytics/overview')) {
      const query = new URL(request.url()).searchParams
      const retention = { rawDays: 30, aggregateDays: 365, timeZone: 'Asia/Shanghai', geoConfigured: true, visitorTrackingSince: '2026-11-07T00:00:00Z' }
      body = { from: query.get('from'), to: query.get('to'), summary: { pageViews: 1234, visitors: 74, todayPageViews: 24, todayVisitors: 8 }, trend: [{day: query.get('from'), pageViews: 2}, {day: new Date(Date.parse(query.get('to')!) - 86400000).toISOString().slice(0, 10), pageViews: 12}], countries: [{name: '中国', pageViews: 24}], provinces: [{name: '江苏省', pageViews: 12}], cities: [{name: '南京市', pageViews: 12}], retention }
    } else if (path.endsWith('/analytics/events')) {
      const query = new URL(request.url()).searchParams, page = Number(query.get('page') ?? 1)
      const filtered = query.has('ip')
      body = { items: [{ id: 'event-'+page, occurredAt: '2026-11-07T09:00:00Z', path: filtered ? '/search' : page === 1 ? '/reading' : '/more', source: 'google.com', ip: filtered || page === 1 ? '114.114.114.114' : '114.114.114.115', country: '中国', province: '江苏省', city: '南京市' }], total: filtered ? 1 : 21, page, pageSize: 20 }
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
  const control = page.getByRole('switch', { name: '访问统计功能' })
  await expect(control).toBeChecked()
  await control.click()
  await expect(control).not.toBeChecked()
  await expect(page.getByText('已关闭访问统计功能。', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '总浏览量' })).toBeVisible()
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
    const control = page.getByRole('switch', { name: '访问统计功能' })
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
  await expect(page.getByRole('switch', { name: '访问统计功能' })).toBeDisabled()
  await expect(page.getByText('访问统计尚未配置，暂时无法开启。')).toBeVisible()
  expect(writes).toEqual([])
})


test('charts, geographic dimension, IP filtering and pagination render on desktop', async ({ page }) => {
  await fixture(page)
  for (const name of ['总浏览量', '总访客数', '今日浏览量', '今日访客数']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /每日访问量/ })).toBeVisible()
  await expect(page.getByRole('list', { name: '地区访问量排名' })).toContainText('中国')
  await page.getByRole('combobox', { name: '地区维度' }).selectOption('cities')
  await expect(page.getByRole('list', { name: '地区访问量排名' })).toContainText('南京市')
  await expect(page.getByLabel('页面路径', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: '访问页面', exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '/reading', exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '114.114.114.114', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByRole('cell', { name: '114.114.114.115', exact: true })).toBeVisible()
  await page.getByLabel('IP 地址', { exact: true }).fill('114.114.114.114')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('cell', { name: '114.114.114.114', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '/search', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await expect(page.getByText('第 1 / 1 页')).toBeVisible()
  const heading = await page.getByRole('heading', {name:'访问统计',exact:true}).boundingBox()
  const power = await page.getByRole('switch', {name:'访问统计功能'}).boundingBox()
  expect(power!.x).toBeGreaterThan(heading!.x + heading!.width)
  await page.locator('main').evaluate(element => { let current: HTMLElement | null = element; while (current) { current.scrollTop = 0; current = current.parentElement } })
  await page.screenshot({ path: '../.local/analytics-v2/dashboard-desktop.png', fullPage: true })
})
