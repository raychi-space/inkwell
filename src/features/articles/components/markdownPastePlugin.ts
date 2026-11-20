import {
  codeBlockEditorDescriptors$,
  createRootEditorSubscription$,
  defaultCodeBlockLanguage$,
  directiveDescriptors$,
  importMdastTreeToLexical,
  importVisitors$,
  jsxComponentDescriptors$,
  realmPlugin,
} from '@mdxeditor/editor'
import {
  $addUpdateTag,
  $caretFromPoint,
  $createParagraphNode,
  $getSelection,
  $insertNodeToNearestRootAtCaret,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
  PASTE_TAG,
  type LexicalNode,
  type RangeSelection,
} from 'lexical'
import type { Nodes } from 'mdast'
import { parseEditorMarkdown } from './editorMarkdown'

const formatted = new Set([
  'heading',
  'strong',
  'emphasis',
  'delete',
  'list',
  'table',
  'blockquote',
  'thematicBreak',
  'inlineCode',
  'image',
  'math',
])
const unsupported = new Set([
  'html',
  'definition',
  'linkReference',
  'imageReference',
  'footnoteDefinition',
  'footnoteReference',
])

function classify(node: Nodes, source: string): 'plain' | 'formatted' | 'unsupported' {
  if (unsupported.has(node.type)) return 'unsupported'

  // Bare URLs, indented text, and pairs of dollar prices can look like Markdown.
  const start = node.position?.start.offset ?? source.length
  const link = node.type === 'link' && (source[start] === '[' || source[start] === '<')
  const fence = node.type === 'code' && /^(?:```|~~~)/.test(source.slice(start, start + 3))
  let result: 'plain' | 'formatted' =
    formatted.has(node.type) || link || fence ? 'formatted' : 'plain'
  if ('children' in node) {
    for (const child of node.children) {
      const kind = classify(child, source)
      if (kind === 'unsupported') return kind
      if (kind === 'formatted') result = kind
    }
  }
  return result
}

function $insertMarkdownPaste(selection: RangeSelection, nodes: LexicalNode[]) {
  if (nodes.length === 1 && $isParagraphNode(nodes[0])) {
    selection.insertNodes(nodes[0].getChildren())
    return
  }

  // Default rich-text paste can merge the first heading into the current paragraph.
  // Split the existing block at the caret to keep the imported block types intact.
  if (!selection.isCollapsed()) selection.removeText()
  let caret = $caretFromPoint(selection.anchor, 'next')
  for (const node of nodes) {
    caret = $insertNodeToNearestRootAtCaret(node, caret, { removeEmptyDestination: true })
  }

  const last = nodes[nodes.length - 1]
  const next = last.getNextSibling()
  if ($isParagraphNode(last)) last.selectEnd()
  else if ($isElementNode(next)) next.selectStart()
  else last.insertAfter($createParagraphNode()).selectStart()
}

export const markdownPastePlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event, origin) => {
          if (origin !== editor || !editor.isEditable() || !(event instanceof ClipboardEvent))
            return false

          const clipboard = event.clipboardData
          if (
            !clipboard ||
            clipboard.files.length ||
            clipboard.types.includes('application/x-lexical-editor')
          )
            return false

          const source = clipboard.getData('text/plain')
          const selection = $getSelection()
          if (!source.trim() || !$isRangeSelection(selection)) return false

          const nodes: LexicalNode[] = []
          try {
            const mdastRoot = parseEditorMarkdown(source)
            if (classify(mdastRoot, source) !== 'formatted') return false

            // Stage all nodes before changing the selection so normal paste can recover the full source.
            importMdastTreeToLexical({
              root: { append: (node) => nodes.push(node), getType: () => 'root' },
              mdastRoot,
              visitors: [...realm.getValue(importVisitors$)],
              jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$),
              directiveDescriptors: realm.getValue(directiveDescriptors$),
              codeBlockEditorDescriptors: realm.getValue(codeBlockEditorDescriptors$),
              defaultCodeBlockLanguage: realm.getValue(defaultCodeBlockLanguage$),
            })
          } catch {
            return false
          }
          if (!nodes.length) return false

          event.preventDefault()
          $addUpdateTag(PASTE_TAG)
          $insertMarkdownPaste(selection, nodes)
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  },
})
