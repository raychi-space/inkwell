import { expect, test, type Page } from '@playwright/test'
import { installOverviewFixture, waitForOverview } from './overview-fixture'

async function openWriting(page: Page, reply: string, propose = false) {
  let submitted: any
  const article = {
    id: 'message-test',
    type: 'ARTICLE',
    status: 'DRAFT',
    version: 1,
    title: '消息测试',
    slug: 'message-test',
    bodyMarkdown: '保留原文。',
    summary: '',
    tags: [],
    category: null,
    coverUrl: null,
    publishedAt: null,
  }
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json: unknown
    if (path.endsWith('/auth/session')) json = { authenticated: true, username: 'fixture' }
    else if (path.endsWith('/auth/csrf')) json = { token: 'fixture', headerName: 'X-CSRF-TOKEN' }
    else if (path.endsWith('/settings')) json = { siteName: 'fixture' }
    else if (path.endsWith('/categories') || path.endsWith('/tags')) json = []
    else if (path.endsWith('/contents'))
      json = { items: [article], total: 1, page: 1, pageSize: 50 }
    else if (path.endsWith('/contents/message-test')) json = article
    else if (path.endsWith('/ai/assistants'))
      json = { items: [{ id: 'assistant', enabled: true, name: '测试助手' }] }
    else if (path.endsWith('/ai/turns')) {
      submitted = route.request().postDataJSON()
      json = { turnId: 'one', status: 'pending' }
    } else if (path.endsWith('/events')) {
      const result = {
        reply,
        ...(propose
          ? {
              proposal: {
                kind: 'document',
                documentId: submitted.context.documentId,
                newText: '保留新文。',
              },
            }
          : {}),
      }
      return route.fulfill({
        contentType: 'text/event-stream',
        body:
          'event: turn\ndata: ' +
          JSON.stringify({ turnId: 'one', status: 'succeeded', result }) +
          '\n\n',
      })
    } else throw Error('Unexpected fixture path ' + path)
    await route.fulfill({ json })
  })
  await installOverviewFixture(page)
  await page.goto('/')
  await waitForOverview(page)
  await page.getByRole('button', { name: '草稿箱', exact: true }).click()
  await page.getByText('消息测试', { exact: true }).click()
  await expect(page.locator('.editable-prose')).toHaveText('保留原文。')
  return () => submitted
}

test('streaming replies render Markdown before completion and do not execute HTML or unsafe links', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (...args) => {
      const response = await original(...args)
      if (!String(args[0]).includes('/ai/turns/one/events')) return response
      const final = await response.text(),
        encoder = new TextEncoder()
      let timer: number
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: turn\ndata: ' +
                  JSON.stringify({
                    turnId: 'one',
                    status: 'running',
                    partialReply: '## 正在写\n\n**重点内容**\n\n公式 $x^',
                  }) +
                  '\n\n',
              ),
            )
            timer = window.setTimeout(() => {
              controller.enqueue(encoder.encode(final))
              controller.close()
            }, 1800)
          },
          cancel() {
            clearTimeout(timer)
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }
  })
  await openWriting(
    page,
    '## 完成\n\n- 第一项\n- 第二项\n\n```js\nconst value = 1\n```\n\n[危险链接](javascript:alert(1))\n\n<script>window.__executed = true</script>\n\n|列|值|\n|--|--|\n|甲|乙|',
  )
  await page.getByLabel('消息', { exact: true }).fill('请说明')
  await page.getByLabel('消息', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: '正在写', exact: true })).toBeVisible()
  await expect(page.locator('.message-markdown strong')).toHaveText('重点内容')
  await expect(page.getByLabel('消息', { exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: '完成', exact: true })).toBeVisible()
  await expect(page.locator('.message-markdown li')).toHaveCount(2)
  await expect(page.locator('.message-markdown pre code')).toContainText('const value = 1')
  await expect(page.locator('.message-markdown table')).toContainText('甲')
  await expect(page.locator('.message-markdown a[href^="javascript:"]')).toHaveCount(0)
  expect(await page.evaluate(() => '__executed' in window)).toBe(false)
})

test('suggestion cards highlight only changed text and retain accepted state outside the reply', async ({
  page,
}, testInfo) => {
  const submitted = await openWriting(page, '**已调整**这句话。', true)
  const input = page.getByLabel('消息', { exact: true })
  await input.fill('请修改')
  await input.press('Enter')
  const card = page.locator('.writing-proposal[data-state="pending"]')
  await expect(card.locator('del')).toHaveText('原')
  await expect(card.locator('ins')).toHaveText('新')
  await expect(page.locator('.message-markdown strong').first()).toHaveText('已调整')
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.locator('.shell:not(.sidebar-collapsed)').count())
    await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await card.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('writing-card-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: '接受', exact: true }).click()
  await expect(page.locator('.editable-prose')).toHaveText('保留新文。')
  await expect(page.locator('.writing-proposal[data-state="accepted"]')).toContainText('已接受')
  await expect(page.locator('.agent-message.assistant')).not.toContainText('[建议已接受]')
  await input.fill('继续讨论')
  await input.press('Enter')
  await expect.poll(() => submitted().history.at(-1).content).toContain('修改建议状态：已接受')
})

test('assistant replies render inline and display math while retaining invalid source and code literals', async ({
  page,
}) => {
  await openWriting(
    page,
    '行内 $E=mc^2$。\n\n$$\n\\frac{1}{2}\n$$\n\n`$literal$`\n\n$\\frac{a$\n\n$\\href{javascript:alert(1)}{bad}$',
  )
  await page.getByLabel('消息', { exact: true }).fill('解释公式')
  await page.getByLabel('消息', { exact: true }).press('Enter')
  const reply = page.locator('.agent-message.assistant .message-markdown')
  await expect(reply.locator('.katex')).toHaveCount(3)
  await expect(reply.locator('.katex-display')).toHaveCount(1)
  await expect(reply.locator('.katex-error')).toContainText('\\frac{a')
  await expect(reply.locator('code').filter({ hasText: '$literal$' })).toHaveCount(1)
  await expect(reply.locator('a')).toHaveCount(0)
})
