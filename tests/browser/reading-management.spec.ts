import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const sample = (name: string) =>
  JSON.parse(readFileSync(new URL('./fixtures/reading-' + name + '.json', import.meta.url), 'utf8'))
async function fixture(page: Page) {
  const sources = sample('sources'),
    models = sample('models'),
    dashboard = sample('dashboard')
  const writes: string[] = []
  let release: (() => void) | undefined
  let holdWrites = false
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname,
      method = req.method()
    let body: unknown
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'reading-fixture' }
    else if (path.endsWith('/auth/csrf')) body = { headerName: 'X-CSRF-TOKEN', token: 'test-only' }
    else if (path.endsWith('/settings')) body = { siteName: '测试站点' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/contents')) body = { items: [], total: 0, page: 1, pageSize: 50 }
    else if (path.endsWith('/reading/integration'))
      body = { mode: 'aihot', managementConfigured: true }
    else if (path.endsWith('/aihot/dashboard')) {
      const n = Number(url.searchParams.get('page') || 1)
      body = {
        ...dashboard,
        tasks: {
          ...dashboard.tasks,
          page: n,
          items: n === 1 ? dashboard.tasks.items : dashboard.tasks.items.slice(0, 8),
        },
      }
    } else if (path.endsWith('/aihot/models')) body = models
    else if (path.endsWith('/aihot/sources')) body = sources
    else if (path.includes('/aihot/sources/') && method === 'GET') {
      const row = sources.items.find((s: { id: string }) => path.endsWith('/' + s.id))
      body = {
        ...row,
        feedUrl: 'https://example.org/feed.xml',
        version: '2026-11-11T00:00:00.000Z',
      }
    } else if (path.includes('/aihot/') && method === 'PUT') {
      writes.push(path)
      if (holdWrites)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      const input = req.postDataJSON()
      if (path.includes('/sources/'))
        body = { ...sources.items[0], ...input, version: '2026-11-11T00:01:00.000Z' }
      else if (path.includes('/budgets/')) {
        Object.assign(
          models.budgets.find((b: { service: string }) => path.endsWith('/' + b.service)),
          input,
        )
        body = models
      } else {
        const cap = models.capabilities.find((c: { key: string }) => path.endsWith('/' + c.key))
        Object.assign(cap, {
          currentKey: input.model || 'default',
          currentLabel: input.model || 'fixture-default',
        })
        body = models
      }
    } else throw Error('Unexpected reading fixture: ' + method + ' ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '拾阅管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '近 7 天采集与处理', exact: true })).toBeVisible()
  return {
    writes,
    hold: () => {
      holdWrites = true
    },
    release: () => {
      holdWrites = false
      release?.()
    },
  }
}

test('refresh is read-only; task paging and configured model choices remain available', async ({
  page,
}) => {
  const f = await fixture(page)
  await page.getByRole('button', { name: '手动刷新', exact: true }).click()
  await page
    .getByRole('navigation', { name: '任务分页' })
    .getByRole('button', { name: '下一页' })
    .click()
  await expect(page.getByRole('navigation', { name: '任务分页' })).toContainText('2 / 2')
  await page.getByRole('tab', { name: '模型与限额' }).click()
  const model = page.locator('select[aria-label$="模型"]').first()
  await expect(model.locator('option')).toHaveText([
    'fixture-default',
    'deepseek-flash',
    'deepseek-flash-think',
    '恢复环境默认',
  ])
  expect(f.writes).toEqual([])
})

test('unsaved sources survive cancelled navigation and mutations block filters and tab changes', async ({
  page,
}) => {
  const f = await fixture(page)
  await page.getByRole('tab', { name: '采集来源' }).click()
  await page
    .getByRole('row')
    .filter({ hasText: '隔离RSS来源' })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  await page.getByLabel('来源名称', { exact: true }).fill('修改尚未保存')
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('tab', { name: '运行看板' }).click()
  await expect(page.getByLabel('来源名称', { exact: true })).toHaveValue('修改尚未保存')
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: '网站管理', exact: true }).click()
  await expect(page.getByLabel('来源名称', { exact: true })).toHaveValue('修改尚未保存')
  f.hold()
  await page.getByRole('button', { name: '保存来源', exact: true }).click()
  await expect(page.getByLabel('来源名称', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('健康状态', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '手动刷新', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: '模型与限额' }).click()
  await expect(page.getByRole('tab', { name: '采集来源' })).toHaveAttribute('aria-selected', 'true')
  f.release()
  await expect(page.getByText('来源已保存。', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '模型与限额' }).click()
  await expect(page.getByRole('heading', { name: '各环节模型' })).toBeVisible()
  expect(f.writes).toHaveLength(1)
})

test('saving one setting retains other model and budget drafts; confirmed refresh discards drafts', async ({
  page,
}) => {
  await fixture(page)
  await page.getByRole('tab', { name: '模型与限额' }).click()
  const models = page.locator('select[aria-label$="模型"]')
  await models.nth(0).selectOption('deepseek-flash')
  await models.nth(1).selectOption('deepseek-flash-think')
  await page.getByLabel('llm每分钟限额', { exact: true }).fill('7')
  await models
    .nth(0)
    .locator('xpath=ancestor::tr')
    .getByRole('button', { name: '保存模型' })
    .click()
  await expect(page.getByRole('status').filter({ hasText: '已保存' })).toBeVisible()
  await expect(models.nth(1)).toHaveValue('deepseek-flash-think')
  await expect(page.getByLabel('llm每分钟限额', { exact: true })).toHaveValue('7')
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: '手动刷新', exact: true }).click()
  await expect(page.getByLabel('llm每分钟限额', { exact: true })).toHaveValue('7')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '手动刷新', exact: true }).click()
  await expect(page.getByLabel('llm每分钟限额', { exact: true })).toHaveValue('10')
})

for (const width of [1280, 390, 320])
  test(`reading tabs scroll inside workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 440 })
    await fixture(page)
    for (const tab of ['运行看板', '采集来源', '模型与限额']) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.locator('.reading-panel')).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      const scroll = page.locator('.management-scroll')
      await scroll.evaluate((e) => {
        e.scrollTop = e.scrollHeight
      })
      expect(
        await scroll.evaluate((e) => e.scrollHeight <= e.clientHeight || e.scrollTop > 0),
      ).toBe(true)
    }
  })
