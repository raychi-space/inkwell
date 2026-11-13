import { expect, type Page } from '@playwright/test'

// Existing feature tests enter their target page after the new default overview loads.
export async function installOverviewFixture(page: Page) {
  await page.route(
    /\/api\/v1\/admin\/(analytics\/(overview|settings)|reading\/integration|contents)(\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() !== 'GET' || !(await page.locator('main.overview-page').count()))
        return route.fallback()
      if (url.pathname.endsWith('/contents')) {
        if (!['1', '5'].includes(url.searchParams.get('pageSize') || '')) return route.fallback()
        return route.fulfill({
          json: {
            items: [],
            total: 0,
            page: 1,
            pageSize: Number(url.searchParams.get('pageSize')),
          },
        })
      }
      if (url.pathname.endsWith('/reading/integration'))
        return route.fulfill({ json: { mode: 'aihot', managementConfigured: false } })
      if (url.pathname.endsWith('/analytics/settings'))
        return route.fulfill({ json: { enabled: true, configured: true, version: 0 } })
      return route.fulfill({
        json: {
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          summary: { pageViews: 0, visitors: 0, todayPageViews: 0, todayVisitors: 0 },
          trend: [],
          countries: [],
          provinces: [],
          cities: [],
          sources: [],
        },
      })
    },
  )
}

export async function waitForOverview(page: Page) {
  await expect(page.getByRole('heading', { name: '概览', exact: true })).toBeVisible()
  await expect(page.getByText('拾阅管理尚未配置')).toBeVisible()
  await expect(page.locator('.overview-metrics section').last()).toContainText('0')
  await expect(page.getByRole('img', { name: /每日访问量/ })).toBeAttached()
  // These legacy fixtures seed overview-only responses before the target feature's
  // own routes take over. Do not carry their deliberately different data across.
  await page.evaluate(async () => {
    const cache = await import(/* @vite-ignore */ '/src/shared/api/sessionCache.ts')
    cache.invalidateReadCache()
  })
}
