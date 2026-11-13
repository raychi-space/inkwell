import { expect, test, type Page } from '@playwright/test'

async function select(page: Page, selector: string, start: number, end: number) {
  await page.locator('.editable-prose').focus()
  await page
    .locator('.editable-prose ' + selector)
    .first()
    .evaluate(
      (element, offsets) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const nodes: Text[] = []
        let node
        while ((node = walker.nextNode())) nodes.push(node as Text)
        const locate = (offset: number): [Text, number] => {
          for (const text of nodes) {
            if (offset <= text.length) return [text, offset]
            offset -= text.length
          }
          throw Error('selection offset out of bounds')
        }
        const range = document.createRange()
        range.setStart(...locate(offsets[0]))
        range.setEnd(...locate(offsets[1]))
        window.getSelection()!.removeAllRanges()
        window.getSelection()!.addRange(range)
      },
      [start, end],
    )
  await page.getByRole('button', { name: '交给助手' }).click()
}

const cases = [
  {
    name: 'multiline quote',
    markdown: '> 引用第一行\n> 引用第二行',
    selector: 'blockquote p',
    start: 0,
    end: 10,
    replacement: '> 新的第一行\n> ~~新的第二行~~',
    expected: '~~新的第二行~~',
  },
  {
    name: 'bold',
    markdown: '前文 **粗体内容** 后文',
    selector: 'strong',
    start: 0,
    end: 2,
    replacement: '**新的**',
    expected: '前文 **新的内容** 后文',
  },
  {
    name: 'plain words in a formatted paragraph',
    markdown: '**保留粗体** 普通文字',
    selector: 'p',
    start: 5,
    end: 9,
    replacement: '替换内容',
    expected: '**保留粗体** 替换内容',
  },
  {
    name: 'heading',
    markdown: '## 标题中的目标文字',
    selector: 'h2',
    start: 4,
    end: 6,
    replacement: '## 新的',
    expected: '## 标题中的新的文字',
  },
  {
    name: 'list item',
    markdown: '- 第一项\n- 第二项目标文字\n- 第三项',
    selector: 'li:nth-child(2)',
    start: 3,
    end: 5,
    replacement: '- 新的',
    expected: '第二项新的文字',
  },
  {
    name: 'link',
    markdown: '前文 [文档说明](https://example.org/docs) 后文',
    selector: 'a',
    start: 0,
    end: 2,
    replacement: '[指南](https://example.org/docs)',
    expected: '前文 [指南说明](https://example.org/docs) 后文',
  },
  {
    name: 'quote',
    markdown: '> 引用中的目标文字',
    selector: 'blockquote p',
    start: 4,
    end: 6,
    replacement: '> 新的',
    expected: '> 引用中的新的文字',
  },
  {
    name: 'italic',
    markdown: '前文 *斜体内容* 后文',
    selector: 'em',
    start: 0,
    end: 2,
    replacement: '*新的*',
    expected: '*新的内容*',
  },
  {
    name: 'nested list',
    markdown: '- 外层\n  - 内层目标文字\n  - 另一项',
    selector: 'li li',
    start: 2,
    end: 4,
    replacement: '新的',
    expected: '内层新的文字',
  },
]
for (const fixture of cases) {
  test(`formatted selection preserves surrounding structure: ${fixture.name}`, async ({ page }) => {
    await page.goto('/?editor-agent-fixture=1&markdown=' + encodeURIComponent(fixture.markdown))
    await expect(page.locator('.editable-prose')).toBeVisible()
    await select(page, fixture.selector, fixture.start, fixture.end)
    await expect(page.getByRole('status')).toHaveText('选区已捕获')
    await page.getByLabel('建议 Markdown').fill(fixture.replacement)
    await page.getByRole('button', { name: '接受', exact: true }).click()
    await page.getByRole('button', { name: '导出 Markdown' }).click()
    await expect(page.getByLabel('导出结果')).toContainText(fixture.expected)
    if (fixture.name === 'list item')
      await expect(page.locator('.editable-prose li')).toHaveCount(3)
    if (fixture.name === 'heading') await expect(page.locator('.editable-prose h2')).toHaveCount(1)
    if (fixture.name === 'multiline quote')
      await expect(page.locator('.editable-prose blockquote')).toHaveCount(1)
    await page.getByRole('radio', { name: /Undo/ }).click()
    await page.getByRole('button', { name: '导出 Markdown' }).click()
    await expect(page.getByLabel('导出结果')).not.toContainText('新的')
  })
}

test('stale selections cannot apply; rejection leaves the rich document intact', async ({
  page,
}) => {
  await page.goto(
    '/?editor-agent-fixture=1&markdown=' + encodeURIComponent('前文 **粗体内容** 后文'),
  )
  await expect(page.locator('.editable-prose strong')).toBeVisible()
  await select(page, 'strong', 0, 2)
  await page.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect(page.locator('.editable-prose strong')).toHaveText('粗体内容')
  await select(page, 'strong', 0, 2)
  await page.getByRole('button', { name: '外部修改原文' }).click()
  await page.getByRole('button', { name: '接受', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('原文已变化')
  await expect(page.locator('.editable-prose')).toHaveText('原文已从外部改变。')
})
