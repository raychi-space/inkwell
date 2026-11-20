import { expect, test, type Locator } from '@playwright/test'
import { installOverviewFixture, waitForOverview } from './overview-fixture'

async function pasteText(editor: Locator, text: string, html?: string) {
  await editor.evaluate(
    (element, { text, html }) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      if (html) data.setData('text/html', html)
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    },
    { text, html },
  )
}

const markdown =
  '## 粘贴来的标题\n\n**重点**\n\n- 第一项\n- 第二项\n\n| 品名 | 数量 |\n| --- | --- |\n| 茶 | 1 |'

test('pasted Markdown replaces the selection, undoes once and survives saving and reopening', async ({
  page,
}) => {
  let article = {
    id: 'paste',
    type: 'ARTICLE',
    status: 'DRAFT',
    title: '粘贴测试文章',
    slug: 'markdown-paste',
    bodyMarkdown: '# 粘贴测试文章\n\n前一段\n\n替换这段\n\n后一段',
    summary: '',
    tags: [],
    category: '未分类',
    version: 1,
    coverUrl: null,
    publishedAt: null,
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let json: unknown
    if (path.endsWith('/auth/session')) json = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) json = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) json = { siteName: '粘贴测试' }
    else if (path.endsWith('/categories')) json = [{ name: '未分类' }]
    else if (path.endsWith('/tags')) json = []
    else if (path.endsWith('/ai/assistants')) json = { items: [] }
    else if (path.endsWith('/contents'))
      json = { items: [article], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/paste')) {
      if (request.method() === 'PUT') {
        article = { ...article, ...request.postDataJSON(), version: article.version + 1 }
      }
      json = article
    } else throw new Error('Unexpected API ' + request.method() + ' ' + path)
    await route.fulfill({ json })
  })
  await installOverviewFixture(page)
  const editor = page.locator('.editable-prose')
  const openDraft = async () => {
    await waitForOverview(page)
    await page.getByRole('button', { name: '内容管理', exact: true }).click()
    await page.getByText(article.title, { exact: true }).click()
    await expect(editor).toBeVisible()
  }

  await page.goto('/')
  await openDraft()
  await editor.getByText('替换这段', { exact: true }).selectText()
  await pasteText(editor, markdown, `<pre>${markdown}</pre>`)
  await expect(editor.locator('h2')).toHaveText('粘贴来的标题')
  await expect(editor.locator('strong')).toHaveText('重点')
  await expect(editor.locator('li')).toHaveText(['第一项', '第二项'])
  await expect(editor.locator('table tbody td').filter({ hasText: '茶' })).toBeVisible()
  await expect(editor.locator(':scope > p')).toHaveText(['前一段', '重点', '后一段'])

  await page.getByRole('radio', { name: 'Undo' }).click()
  await expect(editor.locator(':scope > p')).toHaveText(['前一段', '替换这段', '后一段'])
  await expect(editor.locator('h2, strong, li, table')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Redo' }).click()

  const cell = editor.locator('table tbody td [contenteditable]').getByText('茶', { exact: true })
  await cell.selectText()
  await page.keyboard.insertText('咖啡')
  await page.keyboard.press('Tab')
  await editor.locator(':scope > p').last().click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => article.bodyMarkdown).toMatch(/\| 咖啡 +\| 1 +\|/)
  expect(article.bodyMarkdown).toContain('## 粘贴来的标题\n\n**重点**')
  expect(article.bodyMarkdown).toMatch(/[*-] 第一项\n[*-] 第二项/)

  await page.reload()
  await openDraft()
  await expect(editor.locator('h2')).toHaveText('粘贴来的标题')
  await expect(editor.locator('strong')).toHaveText('重点')
  await expect(editor.locator('li')).toHaveText(['第一项', '第二项'])
  await expect(editor.locator('table tbody td').filter({ hasText: '咖啡' })).toBeVisible()
})

test('block paste at a caret preserves both sides, and plain or unsupported text uses normal paste', async ({
  page,
}) => {
  await page.goto('/?editor-agent-fixture=1&markdown=' + encodeURIComponent('原文后半'))
  const editor = page.locator('.editable-prose')
  await editor.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.insertText('新增')
  await pasteText(editor, '## 标题')
  await expect(editor.locator(':scope > *')).toHaveText(['原文新增', '标题', '后半'])
  await expect(editor.locator('h2')).toHaveText('标题')
  await page.getByRole('radio', { name: 'Undo' }).click()
  await expect(editor.locator('p')).toHaveText('原文新增后半')

  await editor.getByText('原文新增后半', { exact: true }).selectText()
  await pasteText(editor, '一行普通文本 # 标签\n另一行价格 $5 到 $10')
  await expect(editor.locator('p')).toHaveText(['一行普通文本 # 标签', '另一行价格 $5 到 $10'])
  await expect(editor.locator('h2, strong, table')).toHaveCount(0)

  await editor.locator('p').last().click()
  await page.keyboard.press('End')
  await pasteText(editor, ' **粗体**')
  await expect(editor.locator('p').last().locator('strong')).toHaveText('粗体')

  await editor.locator('p').first().click()
  await page.keyboard.press('Home')
  await pasteText(editor, '## 保留源码\n\n脚注[^1]\n\n[^1]: 原始注释')
  await expect(editor).toContainText('## 保留源码')
  await expect(editor).toContainText('[^1]: 原始注释')
  await expect(editor.locator('h2')).toHaveCount(0)
})

test('pasting a PNG still uploads it and exports the stable Markdown URL', async ({ page }) => {
  const publicUrl = '/api/v1/public/assets/paste-image'
  const previewUrl = '/api/v1/admin/assets/paste-image'
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lK8AAAAASUVORK5CYII='
  await page.route('**/api/v1/auth/csrf', (route) =>
    route.fulfill({ json: { token: 'fixture', headerName: 'X-CSRF-TOKEN' } }),
  )
  await page.route('**/api/v1/admin/articles/editor-fixture/assets', async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postData()).toContain('filename="paste.png"')
    await route.fulfill({ json: { url: publicUrl, previewUrl } })
  })
  await page.route('**' + previewUrl, (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }),
  )
  await page.goto('/?editor-agent-fixture=1&markdown=')
  const editor = page.getByRole('textbox', { name: 'editable markdown' })
  await editor.click()
  await editor.evaluate((element, png) => {
    const data = new DataTransfer()
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0))
    data.items.add(new File([bytes], 'paste.png', { type: 'image/png' }))
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  }, png)
  await expect(editor.locator('img')).toHaveAttribute('src', previewUrl)
  await page.getByRole('button', { name: '导出 Markdown' }).click()
  await expect(page.getByLabel('导出结果')).toHaveText(`![](${publicUrl})`)
})
