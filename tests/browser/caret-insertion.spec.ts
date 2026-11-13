import { expect, test, type Page } from '@playwright/test'
import { installOverviewFixture, waitForOverview } from './overview-fixture'

async function caret(page: Page, selector: string, offset: number, elementPoint = false) {
  await page.locator('.editable-prose').first().focus()
  await page
    .locator(selector)
    .first()
    .evaluate(
      (element, options) => {
        const node = options.elementPoint ? element : element.firstChild!
        const range = document.createRange()
        range.setStart(node, options.offset)
        range.collapse(true)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      },
      { offset, elementPoint },
    )
  // Let the native selection reach Lexical before capturing its bookmark.
  await page.waitForTimeout(80)
}

for (const fixture of [
  {
    name: 'text',
    markdown: '相同原文\n\n相同原文',
    selector: '.editable-prose p:nth-child(2) span',
    offset: 2,
    expected: '相同新增原文',
    count: 2,
  },
  {
    name: 'empty document',
    markdown: '',
    selector: '.editable-prose p',
    offset: 0,
    element: true,
    expected: '新增',
    count: 1,
  },
  {
    name: 'heading',
    markdown: '## 前文后文',
    selector: '.editable-prose h2 span',
    offset: 2,
    expected: '前文新增后文',
    count: 1,
  },
  {
    name: 'root element boundary',
    markdown: '上段\n\n下段',
    selector: '.editable-prose[contenteditable]',
    offset: 1,
    element: true,
    expected: '上段新增下段',
    count: 2,
  },
  {
    name: 'list item',
    markdown: '- 第一项\n- 第二项',
    selector: '.editable-prose li:first-child span',
    offset: 1,
    expected: '第新增一项',
    count: 1,
  },
]) {
  test(`cursor adapter inserts into ${fixture.name}, preserves text and undoes once`, async ({
    page,
  }) => {
    await page.goto('/?editor-agent-fixture=1&markdown=' + encodeURIComponent(fixture.markdown))
    await expect(page.locator('.editable-prose').first()).toBeVisible()
    await page.getByRole('button', { name: '导出 Markdown', exact: true }).click()
    const initialMarkdown = await page.getByLabel('导出结果').textContent()
    await caret(page, fixture.selector, fixture.offset, fixture.element)
    await page.getByRole('button', { name: '捕获光标', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('光标已捕获')
    // Moving the active cursor after capture must not retarget an existing proposal.
    if (fixture.name === 'text') await caret(page, '.editable-prose p:first-child span', 0)
    await page.getByRole('textbox', { name: '建议 Markdown' }).fill('新增')
    await page.getByRole('button', { name: '确认光标插入', exact: true }).click()
    await expect(page.locator('.editable-prose')).toContainText(fixture.expected)
    await expect(page.locator('.editable-prose p')).toHaveCount(fixture.count)
    if (fixture.name === 'list item')
      await expect(page.locator('.editable-prose li')).toHaveCount(2)
    await page.getByRole('radio', { name: /Undo/ }).click()
    await page.getByRole('button', { name: '导出 Markdown', exact: true }).click()
    await expect(page.getByLabel('导出结果')).toHaveText(initialMarkdown ?? '')
  })
}

test('cursor targets expire after edits to their block or editor remount', async ({ page }) => {
  for (const action of ['外部修改原文', '重新挂载编辑器']) {
    await page.goto('/?editor-agent-fixture=1&markdown=' + encodeURIComponent('保留原文'))
    await expect(page.locator('.editable-prose')).toBeVisible()
    await caret(page, '.editable-prose p span', 2)
    await page.getByRole('button', { name: '捕获光标', exact: true }).click()
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.getByRole('button', { name: '确认光标插入', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('插入位置已变化')
    await expect(page.locator('.editable-prose')).not.toContainText('新的替换文字')
  }
})

async function openWriting(page: Page, markdown = '相同原文\n\n相同原文') {
  let submitted: any,
    finish: (() => void) | undefined,
    writes = 0
  const article = {
    id: 'caret',
    type: 'ARTICLE',
    status: 'DRAFT',
    version: 1,
    title: '光标测试',
    slug: 'caret',
    bodyMarkdown: markdown,
    summary: '',
    tags: [],
    category: null,
    publishedAt: null,
  }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET' && !path.endsWith('/ai/turns')) writes++
    let json: unknown
    if (path.endsWith('/auth/session')) json = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) json = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) json = { siteName: 'fixture' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) json = []
    else if (path.endsWith('/contents'))
      json = { items: [article], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/caret')) json = article
    else if (path.endsWith('/ai/assistants'))
      json = { items: [{ id: 'assistant', enabled: true, name: '测试助手' }] }
    else if (path.endsWith('/ai/turns')) {
      submitted = route.request().postDataJSON()
      json = { turnId: 'caret-turn', status: 'pending' }
    } else if (path.endsWith('/events')) {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      const task = {
        turnId: 'caret-turn',
        status: 'succeeded',
        result: {
          reply: '已生成新内容。',
          proposal: {
            kind: 'insertion',
            insertionId: submitted.context.insertion.insertionId,
            newText: '**新增**',
          },
        },
      }
      return route.fulfill({
        contentType: 'text/event-stream',
        body: 'event: turn\ndata: ' + JSON.stringify(task) + '\n\n',
      })
    } else throw Error('Unexpected API ' + path)
    await route.fulfill({ json })
  })
  await installOverviewFixture(page)
  await page.goto('/')
  await waitForOverview(page)
  await page.getByRole('button', { name: '草稿箱', exact: true }).click()
  await page.getByText('光标测试', { exact: true }).click()
  await expect(page.locator('.editable-prose')).toContainText('相同原文')
  return {
    submitted: () => submitted,
    finish: async () => {
      await expect.poll(() => !!finish).toBe(true)
      finish!()
    },
    writes: () => writes,
  }
}

test('explicit cursor task uses unsaved text, requires confirmation and retains its send-time position', async ({
  page,
}) => {
  const fixture = await openWriting(page)
  await caret(page, '.editable-prose p:nth-child(2) span', 2)
  await page.keyboard.insertText('未保存')
  await page.getByRole('button', { name: '写入光标处', exact: true }).click()
  const message = page.getByRole('textbox', { name: '消息', exact: true })
  await message.fill('在这里补充新内容')
  await message.press('Enter')
  await expect.poll(() => fixture.submitted()?.mode).toBe('insert')
  expect(fixture.submitted().context.documentMarkdown).toContain('未保存')
  expect(fixture.submitted().context.selection).toBeUndefined()
  expect(fixture.submitted().context.documentId).toBeUndefined()
  expect(fixture.submitted().context.insertion.contextBefore).toContain('未保存')
  await caret(page, '.editable-prose p:first-child span', 0)
  await page.keyboard.insertText('独立编辑')
  await fixture.finish()
  const proposal = page.getByRole('region', { name: '光标插入建议：待确认', exact: true })
  await expect(proposal).toBeVisible()
  await expect(proposal.locator('ins')).toHaveText('**新增**')
  await expect(page.locator('.editable-prose')).not.toContainText('新增')
  await proposal.getByRole('button', { name: '确认插入', exact: true }).click()
  await expect(page.locator('.writing-proposal[data-state="accepted"]')).toBeVisible()
  await expect(page.locator('.editable-prose p').nth(1)).toHaveText('相同未保存新增原文')
  await expect(page.locator('.editable-prose p').first()).toHaveText('独立编辑相同原文')
  await expect(page.locator('.editable-prose strong')).toHaveText('新增')
  await page.getByRole('radio', { name: /Undo/ }).click()
  await expect(page.locator('.editable-prose p').nth(1)).toHaveText('相同未保存原文')
  await expect(page.locator('.editable-prose p').first()).toHaveText('独立编辑相同原文')
  expect(fixture.writes()).toBe(0)
})

test('edits in the insertion block while a task runs expire its suggestion', async ({ page }) => {
  const fixture = await openWriting(page)
  await caret(page, '.editable-prose p:nth-child(2) span', 2)
  await page.getByRole('button', { name: '写入光标处', exact: true }).click()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('补写')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => fixture.submitted()?.mode).toBe('insert')
  await caret(page, '.editable-prose p:nth-child(2) span', 0)
  await page.keyboard.insertText('编辑目标')
  await fixture.finish()
  await expect(page.locator('.writing-proposal[data-state="expired"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认插入', exact: true })).toHaveCount(0)
  await expect(page.locator('.editable-prose p').nth(1)).toHaveText('编辑目标相同原文')
})

test('rejecting insertion keeps the document and does not save or publish it', async ({ page }) => {
  const fixture = await openWriting(page)
  await caret(page, '.editable-prose p:nth-child(2) span', 2)
  await page.getByRole('button', { name: '写入光标处', exact: true }).click()
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('补写')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await fixture.finish()
  const proposal = page.getByRole('region', { name: '光标插入建议：待确认', exact: true })
  await expect(proposal).toBeVisible()
  await proposal.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(page.locator('.writing-proposal[data-state="rejected"]')).toContainText('已拒绝')
  await expect(page.locator('.editable-prose p')).toHaveText(['相同原文', '相同原文'])
  await expect(page.getByRole('region', { name: '光标插入位置', exact: true })).toHaveCount(0)
  expect(fixture.writes()).toBe(0)
})

test('an unsupported new selection before sending invalidates the previous cursor target', async ({
  page,
}) => {
  const fixture = await openWriting(page, '相同原文\n\n```js\nconst value = 1\n```\n\n结尾')
  await caret(page, '.editable-prose p:first-child span', 2)
  await page.getByRole('button', { name: '写入光标处', exact: true }).click()
  const editor = page.locator('.editable-prose[contenteditable]').first()
  await editor.focus()
  await editor.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await expect(page.locator('.conversation-toast')).toContainText('请选择段落')
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('在这里补写')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.locator('.conversation-toast')).toContainText('插入位置已变化')
  expect(fixture.submitted()).toBeUndefined()
  await expect(editor).not.toContainText('新增')
})
