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
      const source = query.get('source')
      const sources = [{name: 'google.com', pageViews: 8}, {name: 'direct_or_unknown', pageViews: 4}, {name: 'github.com', pageViews: 2}].filter(row => !source || row.name === source)
      const count = source ? sources.reduce((total, row) => total + row.pageViews, 0) : 14
      body = { from: query.get('from'), to: query.get('to'), summary: { pageViews: 1234, visitors: 74, todayPageViews: 24, todayVisitors: 8 }, trend: [{day: query.get('from'), pageViews: source === 'direct_or_unknown' ? 0 : 2}, {day: new Date(Date.parse(query.get('to')!) - 86400000).toISOString().slice(0, 10), pageViews: count - (source === 'direct_or_unknown' ? 0 : 2)}], countries: [{name: '中国', pageViews: count}], provinces: [{name: '江苏省', pageViews: count}], cities: [{name: '南京市', pageViews: count}], sources, retention }
    } else if (path.endsWith('/analytics/events')) {
      const query = new URL(request.url()).searchParams, page = Number(query.get('page') ?? 1)
      const filtered = query.has('ip') || query.has('source')
      body = { items: [{ id: 'event-'+page, occurredAt: '2026-11-07T09:00:00Z', path: filtered ? '/search' : page === 1 ? '/reading' : '/more', source: query.get('source') ?? 'google.com', ip: filtered || page === 1 ? '114.114.114.114' : '114.114.114.115', country: '中国', province: '江苏省', city: '南京市' }], total: filtered ? 1 : 21, page, pageSize: 20 }
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

test('statistics scrolls its content while retaining the common desktop page header and sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await fixture(page)
  await expect(page.getByRole('heading', { name: '访问明细', exact: true })).toBeAttached()
  const header = page.locator('main .dashboard-head')
  const sidebar = page.locator('.sidebar')
  const before = { header: await header.boundingBox(), sidebar: await sidebar.boundingBox() }
  await page.mouse.move(800, 450)
  await page.mouse.wheel(0, 1600)
  await expect.poll(() => page.locator('.analytics-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect((await header.boundingBox())!.y).toBe(before.header!.y)
  expect((await sidebar.boundingBox())!.y).toBe(before.sidebar!.y)
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeInViewport()
})

test('statistics remains vertically reachable and its details pan horizontally on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await fixture(page)
  const next = page.getByRole('button', { name: '下一页', exact: true })
  await expect(page.locator('.analytics-metrics')).toHaveAttribute('aria-busy', 'false')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 250, y: 550 }] })
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 550 - i * 40 }] })
    await page.waitForTimeout(25)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await cdp.detach()
  await expect(next).toBeVisible()
  await next.scrollIntoViewIfNeeded()
  await expect(next).toBeInViewport()
  const table = page.locator('.analytics-details .analytics-table-scroll')
  expect(await table.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await table.evaluate(element => { element.scrollLeft = element.scrollWidth })
  expect(await table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('columnheader', { name: '来源', exact: true })).toBeInViewport()
})

test('statistics retains loaded values on a failed query and recovers on retry', async ({ page }) => {
  await fixture(page)
  await expect(page.locator('.analytics-metrics strong').first()).toHaveText('1,234')
  await expect(page.locator('.analytics-metrics')).toHaveAttribute('aria-busy', 'false')
  const pattern = '**/api/v1/admin/analytics/overview?**'
  await page.route(pattern, route => route.fulfill({ status: 503, json: { code: 'ANALYTICS_UNAVAILABLE', message: '统计读取失败，请重试。' } }))
  await page.getByLabel('IP 地址', { exact: true }).fill('203.0.113.123')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('统计读取失败')
  await expect(page.locator('.analytics-metrics strong').first()).toHaveText('1,234')
  await expect(page.getByRole('cell', { name: '114.114.114.114', exact: true })).toBeVisible()
  await page.unroute(pattern)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('第 1 / 1 页')).toBeVisible()
})

test('daily values appear by hover and keyboard without the old expanded table', async ({ page }) => {
  await fixture(page)
  const chart = page.getByRole('img', { name: /每日访问量/ })
  const tooltip = page.getByRole('tooltip')
  await expect(page.getByText('查看每日数值', { exact: true })).toHaveCount(0)
  await chart.locator('circle').first().hover()
  await expect(tooltip).toContainText('2 PV')
  await expect(tooltip).toContainText(await page.getByLabel('开始日期', { exact: true }).inputValue())
  await chart.locator('circle').last().hover()
  await expect(tooltip).toContainText('12 PV')
  await page.locator('.analytics-charts').screenshot({ path: '../.local/analytics-sources-20261108/chart-tooltip.png' })
  await page.getByRole('heading', { name: '每日访问量', exact: true }).hover()
  await expect(tooltip).toHaveCount(0)
  await chart.focus()
  await expect(tooltip).toContainText('2 PV')
  await chart.press('ArrowRight')
  await expect(tooltip).toContainText('12 PV')
  await chart.press('Home')
  await expect(tooltip).toContainText('2 PV')
  await chart.press('End')
  await expect(tooltip).toContainText('12 PV')
  await chart.press('Escape')
  await expect(tooltip).toHaveCount(0)
})

test('phone taps show first and last daily values inside the chart bounds', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true })
  try {
    const page = await context.newPage()
    await fixture(page)
    const chart = page.getByRole('img', { name: /每日访问量/ })
    await chart.scrollIntoViewIfNeeded()
    for (const [index, value] of [[0, '2 PV'], [1, '12 PV']] as const) {
      const circle = await chart.locator('circle').nth(index).boundingBox()
      await page.touchscreen.tap(circle!.x + circle!.width / 2, circle!.y + circle!.height / 2)
      await expect(page.getByRole('tooltip')).toContainText(value)
      const box = (await page.getByRole('tooltip').boundingBox())!
      const plot = (await page.locator('.analytics-line-plot').boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(plot.x - 1)
      expect(box.x + box.width).toBeLessThanOrEqual(plot.x + plot.width + 1)
    }
    await page.locator('.analytics-line-card').screenshot({ path: '../.local/analytics-sources-20261108/chart-tooltip-mobile.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally { await context.close() }
})

test('source ranking filters real request parameters, preserves the date range and global cards, and clears selection', async ({ page }) => {
  const queries: { path: string; query: URLSearchParams }[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (/\/analytics\/(overview|events)$/.test(url.pathname)) queries.push({ path: url.pathname, query: url.searchParams })
  })
  await fixture(page)
  const sources = page.getByRole('region', { name: '访问来源', exact: true })
  await expect(sources.getByRole('row').filter({ hasText: 'google.com' })).toContainText('57.1%')
  const cards = await page.locator('.analytics-metrics strong').allTextContents()
  const from = await page.getByLabel('开始日期', { exact: true }).inputValue()
  const until = await page.getByLabel('结束日期', { exact: true }).inputValue()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第 2 / 2 页')).toBeVisible()
  await page.getByLabel('开始日期', { exact: true }).fill('2026-10-01')
  queries.length = 0
  await sources.getByRole('button', { name: 'google.com', exact: true }).click()
  await expect(sources.getByRole('button', { name: 'google.com', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sources).toContainText('100%')
  await expect(page.getByLabel('来源域名', { exact: true })).toHaveValue('google.com')
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue(from)
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue(until)
  await expect(page.getByText('第 1 / 1 页')).toBeVisible()
  expect(await page.locator('.analytics-metrics strong').allTextContents()).toEqual(cards)
  expect(queries).toHaveLength(2)
  for (const { path, query } of queries) {
    expect(query.get('source')).toBe('google.com')
    expect(query.get('from')).toBe(from)
    if (path.endsWith('/events')) expect(query.get('page')).toBe('1')
  }
  await sources.getByRole('button', { name: '清除来源筛选', exact: true }).click()
  await expect(sources.getByRole('button', { name: 'github.com', exact: true })).toBeVisible()
  await expect(page.getByLabel('来源域名', { exact: true })).toHaveValue('')
  await sources.getByRole('button', { name: '直接访问或未知', exact: true }).click()
  await expect(page.getByLabel('来源域名', { exact: true })).toHaveValue('direct_or_unknown')
  await expect(sources.getByRole('button', { name: '直接访问或未知', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.analytics-details tbody')).toContainText('直接访问或未知')
  await page.getByLabel('IP 地址', { exact: true }).fill('114.114.114.114')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.locator('.analytics-metrics')).toHaveAttribute('aria-busy', 'false')
  await sources.getByRole('button', { name: '直接访问或未知', exact: true }).click()
  await expect(page.getByLabel('来源域名', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('IP 地址', { exact: true })).toHaveValue('114.114.114.114')
  await expect(sources.getByRole('button', { name: 'github.com', exact: true })).toBeVisible()
})

test('source selection failure retains the applied chart and selection until an explicit retry', async ({ page }) => {
  await fixture(page)
  const sources = page.getByRole('region', { name: '访问来源', exact: true })
  await expect(sources.getByRole('button', { name: 'github.com', exact: true })).toBeVisible()
  const pattern = '**/api/v1/admin/analytics/overview?**'
  await page.route(pattern, route => route.fulfill({ status: 503, json: { code: 'ANALYTICS_UNAVAILABLE', message: '统计读取失败，请重试。' } }))
  await sources.getByRole('button', { name: 'google.com', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('统计读取失败')
  await expect(sources.getByRole('button', { name: 'google.com', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(sources.getByRole('button', { name: 'github.com', exact: true })).toBeVisible()
  await page.unroute(pattern)
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(sources.getByRole('button', { name: 'google.com', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

for (const variant of ['empty', 'zero', 'single', 'many'] as const) {
  test(`chart and sources handle ${variant} data and long source names`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await fixture(page)
    await expect(page.locator('.analytics-metrics')).toHaveAttribute('aria-busy', 'false')
    const longName = 'very-long-referrer-'.repeat(8) + '.example'
    await page.route('**/api/v1/admin/analytics/overview?**', async route => {
      const count = variant === 'empty' ? 0 : variant === 'many' ? 366 : 1
      const from = new URL(route.request().url()).searchParams.get('from')!
      await route.fulfill({ json: {
        from, to: from, summary: { pageViews: 1234, visitors: 74, todayPageViews: 24, todayVisitors: 8 },
        trend: Array.from({ length: count }, (_, i) => ({ day: new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10), pageViews: variant === 'zero' ? 0 : 100 })),
        countries: [], provinces: [], cities: [], sources: variant === 'empty' ? [] : [{ name: longName, pageViews: variant === 'zero' ? 0 : 50 }, ...(variant === 'many' ? Array.from({length: 99}, (_, i) => ({name: `source-${i}.example`, pageViews: 1})) : [])],
        retention: { rawDays: 30, aggregateDays: 365, timeZone: 'Asia/Shanghai', geoConfigured: true, visitorTrackingSince: '2026-11-07T00:00:00Z' },
      } })
    })
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.locator('.analytics-metrics')).toHaveAttribute('aria-busy', 'false')
    const sources = page.getByRole('region', { name: '访问来源', exact: true })
    if (variant === 'empty') {
      await expect(sources).toContainText('这个区间还没有来源数据。')
      await expect(page.locator('.analytics-line circle')).toHaveCount(0)
    } else {
      await expect(sources.getByRole('button', { name: longName, exact: true })).toBeVisible()
      if (variant === 'single') await expect(sources).toContainText('50%')
      if (variant === 'zero') await expect(sources).toContainText('0%')
      const chart = page.getByRole('img', { name: /每日访问量/ })
      await chart.focus()
      await chart.press('End')
      await expect(page.getByRole('tooltip')).toContainText(variant === 'zero' ? '0 PV' : '100 PV')
      if (variant === 'many') {
        const scroll = page.locator('.analytics-source-scroll')
        await scroll.scrollIntoViewIfNeeded()
        const box = (await scroll.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.wheel(0, 10000)
        await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
        await expect(sources.getByRole('button', { name: 'source-98.example', exact: true })).toBeInViewport()
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
