import { test, expect } from '@playwright/test'

test('save silently prepares metadata; preview edits publish only after confirmation', async ({ page }) => {
  let article = { id: 'fixture', type: 'ARTICLE', status: 'DRAFT', version: 1, title: '正文标题', slug: 'draft-fixture', summary: '', bodyMarkdown: '# 正文标题\n\n正文内容。', tags: [], category: '未分类', coverUrl: null, publishedAt: null as string | null, updatedAt: '2026-10-03T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', publicUpdatedAt: null, hasUnpublishedChanges: true }
  let published = 0, turns = 0, polls = 0, fail = false
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    let body: unknown = {}
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/public/settings') || path.endsWith('/admin/settings')) body = { siteName: '写作测试', avatarUrl: null }
    else if (path.endsWith('/categories')) body = { items: [{ name: '未分类' }] }
    else if (path.endsWith('/tags')) body = { items: [] }
    else if (path.endsWith('/ai/assistants')) body = { items: [{ id: 'assistant', enabled: true, name: '测试助手' }] }
    else if (path.endsWith('/ai/turns') && req.method() === 'POST') { turns++; polls = 0; expect(req.postDataJSON().mode).toBe('metadata'); body = { turnId: 'turn', status: 'pending' } }
    else if (path.endsWith('/ai/turns/turn')) { polls++; body = polls < 2 ? { status: 'running' } : fail ? { status: 'failed', error: { message: '模型暂时不可用' } } : { status: 'succeeded', result: { proposal: { kind: 'metadata', title: '生成标题', summary: '生成摘要', slug: 'first-five-english-title-words' } } } }
    else if (path.endsWith('/contents')) body = { items: [article], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/fixture/publish')) { expect(req.postDataJSON().metadataReviewed).toBe(true); published++; article = { ...article, status: 'PUBLISHED', publishedAt: '2026-10-03T00:00:00Z', version: article.version + 1 }; body = article }
    else if (path.endsWith('/contents/fixture')) { if (req.method() === 'PUT') article = { ...article, ...req.postDataJSON(), version: article.version + 1 }; body = article }
    else throw new Error('Unexpected API ' + req.method() + ' ' + path)
    if (path.endsWith('/ai/turns/turn')) body = { ...(body as object), turnId: 'turn' }
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByText('正文标题', { exact: true }).click()
  await expect(page.getByText('发布信息', { exact: true })).toHaveCount(0)
  await expect(page.locator('[contenteditable=true]').first()).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
  await expect(page.getByText('工作稿和发布信息已保存。点击发布可预览并修改，确认后才会公开。')).toBeVisible()
  expect(published).toBe(0)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('发布标题').fill('人工确认标题')
  await page.getByRole('textbox', { name: '摘要', exact: true }).fill('人工确认摘要')
  await page.getByLabel('地址别名').fill('manual-address')
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(published).toBe(1); expect(turns).toBe(1)
  expect(article.title).toBe('人工确认标题'); expect(article.summary).toBe('人工确认摘要'); expect(article.slug).toBe('manual-address')
  await page.getByRole('button', { name: '发布更新', exact: true }).click()
  await expect(page.getByLabel('地址别名')).toHaveAttribute('readonly', '')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(published).toBe(1)
  // Reload invalidates in-memory generation cache. Direct publish waits and failures cannot publish.
  fail = true
  await page.reload()
  await page.getByText('人工确认标题', { exact: true }).click()
  await page.getByRole('button', { name: '发布更新', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认发布', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText('模型暂时不可用')
  expect(published).toBe(1)
  fail = false
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled()
  await expect(page.getByLabel('地址别名')).toHaveValue('manual-address')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(published).toBe(1)
})
