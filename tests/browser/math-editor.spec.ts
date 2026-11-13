import { expect, test, type Page } from '@playwright/test'

async function open(page: Page, markdown: string) {
  await page.goto('/?editor-agent-fixture=1&markdown=' + encodeURIComponent(markdown))
  await expect(page.locator('.editable-prose[contenteditable]')).toBeVisible()
}
async function exported(page: Page) {
  await page.getByRole('button', { name: '导出 Markdown' }).click()
  return page.getByLabel('导出结果')
}

test('formula import preserves source, code and invalid TeX without dirtying the draft', async ({
  page,
}) => {
  const markdown = '行内 $E=mc^2$ 结尾。\n\n$$\n\\frac{a}{b}\n$$\n\n`$literal$`\n\n$\\frac{a$'
  await open(page, markdown)
  await expect(page.locator('.editable-prose .katex')).toHaveCount(2)
  await expect(page.locator('.editable-prose .katex-error')).toHaveCount(1)
  await expect(page.locator('.editable-prose code')).toHaveText('$literal$')
  await expect(page.getByLabel('导出结果')).toBeEmpty()
  const result = await exported(page)
  await expect(result).toContainText('$E=mc^2$')
  await expect(result).toContainText('\\frac{a}{b}')
  await expect(result).toContainText('$\\frac{a$')
  const saved = await result.textContent()
  await open(page, saved!)
  await expect(page.locator('.editable-prose .katex')).toHaveCount(2)
  await expect(page.locator('.editable-prose .katex-error')).toHaveCount(1)
})

test('toolbar inserts at caret, edits preview, cancels, deletes and undoes a formula', async ({
  page,
}) => {
  await open(page, '前文后文')
  await page.locator('.editable-prose p').evaluate((element) => {
    const range = document.createRange()
    range.setStart(element.firstChild!.firstChild ?? element.firstChild!, 2)
    range.collapse(true)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  await page.getByRole('button', { name: '插入公式', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '插入公式', exact: true })
  await dialog.getByLabel('公式源码').fill('x^2')
  await expect(dialog.locator('.katex')).toBeVisible()
  await dialog.getByRole('button', { name: '保存公式' }).click()
  await expect(await exported(page)).toContainText('前文$x^2$后文')
  await page.getByRole('button', { name: /^编辑公式：/ }).click()
  await page.getByLabel('公式源码').fill('y^3')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(await exported(page)).toContainText('$x^2$')
  await page.getByRole('button', { name: /^编辑公式：/ }).click()
  await page.getByLabel('公式源码').fill('y^3')
  await page.getByRole('button', { name: '保存公式' }).click()
  await expect(await exported(page)).toContainText('$y^3$')
  await page.getByRole('button', { name: /^编辑公式：/ }).click()
  await page.getByRole('button', { name: '删除公式' }).click()
  await expect(page.locator('.editable-prose .katex')).toHaveCount(0)
  await page.getByRole('radio', { name: /Undo/ }).click()
  await expect(await exported(page)).toContainText('$y^3$')
})

test('block formula can be inserted into an empty document and unsafe macros stay inert', async ({
  page,
}) => {
  await open(page, '')
  await page.locator('.editable-prose[contenteditable]').click()
  await page.getByRole('button', { name: '插入公式', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '插入公式', exact: true })
  await dialog.getByLabel('显示方式').selectOption('block')
  await dialog.getByLabel('公式源码').fill('\\href{javascript:alert(1)}{x} + \\htmlClass{evil}{y}')
  await dialog.getByRole('button', { name: '保存公式' }).click()
  await expect(page.locator('.editor-math-block')).toHaveCount(1)
  await expect(page.locator('.editable-prose a, .editable-prose .evil')).toHaveCount(0)
  await expect(await exported(page)).toContainText('$$\n\\href')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /^编辑公式：/ }).click()
  await page.getByLabel('公式源码').fill('x+'.repeat(180) + 'y')
  await page.getByRole('button', { name: '保存公式' }).click()
  expect(
    await page
      .locator('.editor-math-block .katex-display')
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBe(true)
})

test('formatting around inline formulas survives roundtrip and adjacent words stay selectable', async ({
  page,
}) => {
  await open(page, '**$x$** *$y$* ~~$z$~~ 前文 $a$ 后文')
  const result = await exported(page)
  await expect(result).toContainText('**$x$**')
  await expect(result).toContainText('*$y$*')
  await expect(result).toContainText('~~$z$~~')
  await page.locator('.editable-prose p').evaluate((element) => {
    const text = [...element.childNodes].find((n) => n.textContent === ' 前文 ')!
    const range = document.createRange()
    range.setStart(text.firstChild ?? text, 1)
    range.setEnd(text.firstChild ?? text, 3)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
  })
  await page.getByRole('button', { name: '交给助手', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('选区已捕获')
  await page.getByLabel('建议 Markdown').fill('新文')
  await page.getByRole('button', { name: '接受', exact: true }).click()
  await expect(await exported(page)).toContainText('新文 $a$ 后文')
})
