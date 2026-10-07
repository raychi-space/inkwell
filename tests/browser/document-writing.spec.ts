import { test, expect } from '@playwright/test'

test('whole-document suggestions can be rejected, accepted and invalidated by newer edits', async ({ page }) => {
  const article = { id: 'doc', type: 'ARTICLE', status: 'DRAFT', version: 1, title: '全文测试', slug: 'whole-test', summary: '', bodyMarkdown: '原始正文。', tags: [], category: '未分类', publishedAt: null }
  let request: any, sequence = 0, savedBody = ''
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = {}
    if (path.endsWith('/auth/session')) body = { authenticated: true, username: 'test-user' }
    else if (path.endsWith('/auth/csrf')) body = { token: 'test', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) body = { siteName: '本地测试', avatarUrl: null }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) body = []
    else if (path.endsWith('/ai/assistants')) body = { items: [{ id: 'assistant', enabled: true, name: '全文助手', icon: 'lucide:bot' }] }
    else if (path.endsWith('/contents')) body = { items: [article], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/doc')) {
      if (route.request().method() === 'PUT') {
        Object.assign(article, route.request().postDataJSON(), { version: article.version + 1 })
        savedBody = article.bodyMarkdown
      }
      body = article
    }
    else if (path.endsWith('/ai/turns')) {
      const submitted = route.request().postDataJSON()
      if (submitted.mode === 'metadata') {
        await route.fulfill({ json: { turnId: 'metadata', status: 'pending' } })
        return
      }
      request = submitted; sequence++
      expect(request.context.documentId).toBeTruthy()
      expect(request.context.selection).toBeUndefined()
      body = { turnId: 'turn-' + sequence, status: 'pending' }
    } else if (path.endsWith('/ai/turns/metadata')) {
      body = { turnId: 'metadata', status: 'succeeded', result: { proposal: { kind: 'metadata', title: article.title, summary: '摘要', slug: article.slug } } }
    } else if (path.endsWith('/events')) {
      const id = 'turn-' + sequence, captured = request
      // Leave a real editing window before returning the proposal.
      if (sequence === 3) await new Promise(r => setTimeout(r, 1200))
      const task = { turnId: id, status: 'succeeded', result: { reply: '已阅读全文并生成建议。', proposal: { kind: 'document', documentId: captured.context.documentId, newText: captured.context.documentMarkdown + '\n\n新增段落。' } } }
      await route.fulfill({ contentType: 'text/event-stream', body: 'event: turn\ndata: ' + JSON.stringify(task) + '\n\n' })
      return
    } else throw Error('Unexpected API ' + path)
    await route.fulfill({ json: body })
  })
  await page.goto('/')
  await page.getByText('全文测试', { exact: true }).click()
  const editor = page.locator('.editable-prose').first()
  await expect(editor).toHaveText('原始正文。')
  const message = page.getByRole('textbox', { name: '消息', exact: true })
  const proposal = page.getByRole('region', { name: '全文修改建议' })
  await message.fill('请扩写全文'); await message.press('Enter')
  await expect(proposal).toBeVisible()
  await expect(editor).not.toContainText('新增段落')
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(editor).toHaveText('原始正文。')
  await message.fill('请扩写全文'); await message.press('Enter')
  await expect(proposal).toBeVisible()
  await page.getByRole('button', { name: '接受', exact: true }).click()
  await expect(editor).toContainText('新增段落')
  await expect(page.getByText(/尚未保存/)).toBeVisible()
  await page.getByRole('radio', { name: /Undo/ }).click()
  await expect(editor).toHaveText('原始正文。')
  await page.getByRole('radio', { name: /Redo/ }).click()
  await expect(editor).toContainText('新增段落')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => savedBody).toContain('新增段落')
  await expect(page.getByText('工作稿和发布信息已保存。点击发布可预览并修改，确认后才会公开。')).toBeVisible()
  await expect(page.locator('.chat-identity').first()).toContainText('test-user')
  await message.fill('继续修改'); await message.press('Enter')
  await expect(message).toBeDisabled()
  await editor.fill('用户刚刚写的新正文。')
  await expect(page.getByRole('region', { name: '写作对话' }).getByRole('status')).toContainText('正文已变化')
  await expect(proposal).toHaveCount(0)
  await expect(editor).toHaveText('用户刚刚写的新正文。')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})
