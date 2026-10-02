import { fromMarkdown } from 'mdast-util-from-markdown'

/** Same rule as wellspring: first top-level heading, excluding quoted/code headings. */
export function documentTitle(markdown: string, fallback = ''): string {
  const heading = fromMarkdown(markdown).children.find(node => node.type === 'heading')
  if (!heading || !('children' in heading)) return fallback
  function text(node: { type: string; value?: string; children?: unknown[] }): string {
    if (node.type === 'html' || node.type === 'image' || node.type === 'imageReference') return ''
    if (typeof node.value === 'string') return node.value
    return (node.children ?? []).map(child => text(child as Parameters<typeof text>[0])).join('')
  }
  return text(heading).trim()
}
