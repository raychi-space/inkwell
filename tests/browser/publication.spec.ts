import { test, expect } from '@playwright/test'

test('save silently prepares metadata; preview edits publish only after confirmation', async ({ page }) => {
  let article = { id: 'fixture', type: 'ARTICLE', status: 'DRAFT', version: 1, title: '正文标题', slug: 'draft-fixture', summary: '', bodyMarkdown: '# 正文标题\n\n正文内容。', tags: [], category: '未分类', coverUrl: null, publishedAt: null as string | null, updatedAt: '2026-10-03T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', publicUpdatedAt: null, hasUnpublishedChanges: true }
  let published = 0, turns = 0, polls = 0, fail = false, tagCreates = 0
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    let body: unknown = {}
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/public/settings') || path.endsWith('/admin/settings')) body = { siteName: '写作测试', avatarUrl: null }
    else if (path.endsWith('/categories')) body = req.method() === 'POST' ? { name: req.postDataJSON().name } : [{ name: '未分类' }]
    else if (path.endsWith('/tags')) { if (req.method() === 'POST') tagCreates++; body = [] }
    else if (path.endsWith('/ai/assistants')) { await new Promise(resolve => setTimeout(resolve, 800)); body = { items: [{ id: 'assistant', enabled: true, name: '测试助手' }] } }
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
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
  await expect(page.locator('[contenteditable=true]').first()).toBeVisible()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled()
  await expect(page.getByText('工作稿和发布信息已保存。点击发布可预览并修改，确认后才会公开。')).toBeVisible()
  expect(published).toBe(0)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.editor-main .editor-taxonomy')).toHaveCount(0)
  await page.getByRole('combobox', { name: '分类', exact: true }).fill('测试分类')
  await page.getByRole('combobox', { name: '分类', exact: true }).press('Enter')
  await page.getByRole('combobox', { name: '标签', exact: true }).fill('保留标签')
  await page.getByRole('combobox', { name: '标签', exact: true }).press('Enter')
  await page.getByRole('combobox', { name: '标签', exact: true }).fill('删除标签')
  await page.getByRole('combobox', { name: '标签', exact: true }).press('Enter')
  await page.getByRole('button', { name: '移除标签 删除标签', exact: true }).click()
  await expect(page.locator('.tag-combobox-input .input-tag')).toHaveCount(1)
  expect(tagCreates).toBe(0)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(tagCreates).toBe(0)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认发布', exact: true })).toBeEnabled()
  await page.getByLabel('发布标题').fill('人工确认标题')
  await page.getByRole('textbox', { name: '摘要', exact: true }).fill('人工确认摘要')
  await page.getByLabel('地址别名').fill('manual-address')
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(published).toBe(1); expect(turns).toBe(2); expect(tagCreates).toBe(0)
  expect(article.category).toBe('测试分类'); expect(article.tags).toEqual(['保留标签']); expect(article.title).toBe('人工确认标题'); expect(article.summary).toBe('人工确认摘要'); expect(article.slug).toBe('manual-address')
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

test('posts publish without title, summary or model and taxonomy menus escape dialog clipping', async ({ page }) => {
  let post = { id: 'post', type: 'POST', status: 'DRAFT', version: 1, title: '', summary: '', slug: 'b912a362-68c0-4fbb-a206-9da6d42b51c7', bodyMarkdown: '只写正文的帖子。', tags: [], category: null, publishedAt: null as string | null }
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    let body: unknown = {}
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) body = { siteName: '帖子测试' }
    else if (path.endsWith('/categories')) body = []
    else if (path.endsWith('/tags')) body = [{ name: '已有标签' }]
    else if (path.endsWith('/ai/assistants')) body = { items: [] }
    else if (path.endsWith('/contents')) body = { items: [post], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/post/publish')) { post = { ...post, status: 'PUBLISHED', publishedAt: '2026-10-04T00:00:00Z' }; body = post }
    else if (path.endsWith('/contents/post')) { if (req.method() === 'PUT') post = { ...post, ...req.postDataJSON(), version: post.version + 1 }; body = post }
    else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /只写正文的帖子/ }).click()
  await expect(page.getByRole('textbox', { name: '正文 Markdown', exact: true })).toHaveValue('只写正文的帖子。')
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('发布标题')).toHaveCount(0)
  await expect(dialog.getByRole('textbox', { name: '摘要', exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('地址别名')).toHaveValue(post.slug)
  await expect(dialog.getByLabel('地址别名')).toHaveAttribute('readonly', '')
  const tags = dialog.getByRole('combobox', { name: '标签', exact: true })
  await tags.click()
  await expect(page.locator('.name-combobox-menu:popover-open')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(page.getByRole('option', { name: '已有标签', exact: true })).toBeVisible()
  expect(await page.getByRole('option', { name: '已有标签', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left + 10, r.top + r.height / 2)) })).toBe(true)
  await page.getByRole('option', { name: '已有标签', exact: true }).click()
  await expect(dialog.locator('.input-tag')).toContainText('已有标签')
  await dialog.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(post.title).toBe(''); expect(post.summary).toBe(''); expect(post.tags).toEqual(['已有标签']); expect(post.status).toBe('PUBLISHED')
})
