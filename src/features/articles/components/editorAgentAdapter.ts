import { realmPlugin, rootEditor$, insertMarkdown$, type MDXEditorMethods } from '@mdxeditor/editor'
import {
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  $isTextNode,
  $isElementNode,
  $isRootNode,
  $getRoot,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type RangeSelection,
  type LexicalNode,
} from 'lexical'
import type {
  EditorAgentAdapter,
  SelectionSnapshot,
  InsertionSnapshot,
} from '../../../shared/types/editor'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Nodes } from 'mdast'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import { math } from 'micromark-extension-math'
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math'

/** A single-block edit keeps its existing heading/list/quote container. */
function inlineFragment(markdown: string) {
  let node: Nodes = fromMarkdown(markdown, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })
  if (node.children.length === 1 && node.children[0].type === 'paragraph') return markdown
  while (
    ['root', 'blockquote', 'list', 'listItem'].includes(node.type) &&
    'children' in node &&
    node.children.length === 1
  )
    node = node.children[0]
  if ((node.type !== 'paragraph' && node.type !== 'heading') || !node.children.length)
    throw new Error('单段选区请返回一段文字；多段修改请扩大选区或使用全文修改。')
  return toMarkdown(
    { type: 'root', children: [{ type: 'paragraph', children: node.children }] },
    { extensions: [gfmToMarkdown(), mathToMarkdown()] },
  ).replace(/\n$/, '')
}

/** Targets belong to one root editor instance. No Markdown offsets or string search. */
export function createEditorAgentAdapter(
  methods: () => MDXEditorMethods | null,
  onDocumentChange: () => void = () => {},
) {
  let editor: LexicalEditor | null = null
  let insert: ((markdown: string) => void) | null = null
  const targets = new Map<
    string,
    {
      bookmark: RangeSelection
      before: string
      structure: string
      inline: boolean
    }
  >()
  const insertions = new Map<string, { bookmark: RangeSelection; structure: string }>()
  function block(node: LexicalNode): LexicalNode | null {
    if (['paragraph', 'heading', 'listitem'].includes(node.getType())) return node
    return node.getParent() ? block(node.getParent()!) : null
  }
  const supported = new Set([
    'text',
    'paragraph',
    'heading',
    'quote',
    'list',
    'listitem',
    'link',
    'autolink',
    'linebreak',
    'math',
  ])
  function supportedTree(node: LexicalNode): boolean {
    return (
      supported.has(node.getType()) &&
      (!$isElementNode(node) || node.getChildren().every(supportedTree))
    )
  }
  const serialize = (node: LexicalNode): unknown => ({
    key: node.getKey(),
    value: node.exportJSON(),
    children: $isElementNode(node) ? node.getChildren().map(serialize) : undefined,
  })
  function structure(bookmark: RangeSelection) {
    const roots = [...new Set(bookmark.getNodes().map((node) => node.getTopLevelElementOrThrow()))]
    return JSON.stringify(roots.map(serialize))
  }
  function validInsertion(bookmark: RangeSelection) {
    if (!bookmark.isCollapsed()) return false
    const point = bookmark.anchor,
      node = $getNodeByKey(point.key)
    if (!node || point.offset < 0) return false
    if (point.type === 'text')
      return (
        $isTextNode(node) &&
        point.offset <= node.getTextContentSize() &&
        supportedTree(node.getTopLevelElementOrThrow())
      )
    if (!$isElementNode(node) || point.offset > node.getChildrenSize()) return false
    // Element points represent empty paragraphs and boundaries around noneditable formulas.
    // A math node itself (or another nested/decorator editor) is never a target.
    return $isRootNode(node) || supportedTree(node.getTopLevelElementOrThrow())
  }
  function insertionStructure(bookmark: RangeSelection) {
    const node = $getNodeByKey(bookmark.anchor.key)!
    if ($isRootNode(node)) {
      const children = node.getChildren(),
        offset = bookmark.anchor.offset
      return JSON.stringify({
        keys: children.map((child) => child.getKey()),
        before: children[offset - 1] ? serialize(children[offset - 1]) : null,
        after: children[offset] ? serialize(children[offset]) : null,
      })
    }
    return JSON.stringify(serialize(node.getTopLevelElementOrThrow()))
  }
  function valid(bookmark: RangeSelection) {
    for (const point of [bookmark.anchor, bookmark.focus]) {
      const node = $getNodeByKey(point.key)
      if (
        !node ||
        !$isTextNode(node) ||
        point.type !== 'text' ||
        point.offset > node.getTextContentSize()
      )
        return false
    }
    return bookmark.getNodes().every((node) => supportedTree(node.getTopLevelElementOrThrow()))
  }
  const adapter: EditorAgentAdapter = {
    getCurrentMarkdown: () => methods()?.getMarkdown() ?? '',
    applyDocument(before, markdown) {
      const current = methods()
      if (!current || !editor || current.getMarkdown() !== before)
        throw new Error('正文已变化，请重新生成修改建议。')
      // setMarkdown deliberately mutes MDXEditor's onChange. Commit one undo step
      // and notify the draft owner explicitly after the Markdown has changed.
      editor.update(() => current.setMarkdown(markdown), {
        discrete: true,
        tag: HISTORY_PUSH_TAG,
      })
      onDocumentChange()
      targets.clear()
      insertions.clear()
    },
    captureInsertion() {
      if (!editor?.getRootElement()?.isConnected) return null
      let captured: InsertionSnapshot | null = null
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !validInsertion(selection)) return
        const root = $getRoot(),
          before = selection.clone(),
          after = selection.clone()
        before.anchor.set(root.getKey(), 0, 'element')
        after.focus.set(root.getKey(), root.getChildrenSize(), 'element')
        const snapshot = insertionStructure(selection)
        const existing = [...insertions.entries()].find(
          ([, target]) =>
            target.bookmark.anchor.is(selection.anchor) && target.structure === snapshot,
        )
        const insertionId = existing?.[0] ?? crypto.randomUUID()
        insertions.clear()
        insertions.set(insertionId, { bookmark: selection.clone(), structure: snapshot })
        captured = {
          insertionId,
          contextBefore: before.getTextContent().slice(-500),
          contextAfter: after.getTextContent().slice(0, 500),
        }
      })
      return captured
    },
    validateInsertion(id) {
      const target = insertions.get(id)
      if (!editor?.getRootElement()?.isConnected || !target) return false
      return editor
        .getEditorState()
        .read(
          () =>
            validInsertion(target.bookmark) &&
            insertionStructure(target.bookmark) === target.structure,
        )
    },
    applyInsertion(id, markdown) {
      const target = insertions.get(id)
      if (!editor || !insert || !target || !adapter.validateInsertion(id))
        throw new Error('插入位置已变化，请重新设置光标。')
      if (!markdown.trim() || markdown.length > 100000)
        throw new Error('插入内容无效，请重新生成。')
      insertions.delete(id)
      editor.update(
        () => {
          if (
            !validInsertion(target.bookmark) ||
            insertionStructure(target.bookmark) !== target.structure
          )
            throw new Error('插入位置已变化，请重新设置光标。')
          $setSelection(target.bookmark.clone())
          insert!(markdown)
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      )
    },
    releaseInsertion(id) {
      insertions.delete(id)
    },
    captureSelection() {
      if (!editor?.getRootElement()?.isConnected) return null
      let captured: SelectionSnapshot | null = null
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed() || !valid(selection)) return
        const before = selection.getTextContent()
        const exported = methods()?.getSelectionMarkdown() ?? ''
        if (!before.trim() || !exported.trim()) return
        // MDXEditor can serialize empty unselected siblings at selection boundaries.
        // Preserve actual selected newlines and all text/space content.
        const start = before.startsWith('\n') ? exported : exported.replace(/^\n+/, '')
        const inline =
          block($getNodeByKey(selection.anchor.key)!)?.getKey() ===
          block($getNodeByKey(selection.focus.key)!)?.getKey()
        const fragment = before.endsWith('\n') ? start : start.replace(/\n+$/, '')
        let beforeMarkdown: string
        try {
          beforeMarkdown = inline ? inlineFragment(fragment) : fragment
        } catch {
          return
        }
        if (!before.trim() || !beforeMarkdown.trim()) return
        const selectionId = crypto.randomUUID()
        const nodes = selection.getNodes()
        const first = nodes[0].getTopLevelElementOrThrow()
        const last = nodes[nodes.length - 1].getTopLevelElementOrThrow()
        const existing = [...targets.entries()][0]
        if (
          existing &&
          existing[1].bookmark.anchor.is(selection.anchor) &&
          existing[1].bookmark.focus.is(selection.focus) &&
          existing[1].before === before &&
          existing[1].structure === structure(selection)
        ) {
          captured = {
            selectionId: existing[0],
            beforeMarkdown,
            contextBefore: first.getPreviousSibling()?.getTextContent().slice(-500) ?? '',
            contextAfter: last.getNextSibling()?.getTextContent().slice(0, 500) ?? '',
          }
          return
        }
        targets.clear()
        targets.set(selectionId, {
          bookmark: selection.clone(),
          before,
          structure: structure(selection),
          inline,
        })
        captured = {
          selectionId,
          beforeMarkdown,
          contextBefore: first.getPreviousSibling()?.getTextContent().slice(-500) ?? '',
          contextAfter: last.getNextSibling()?.getTextContent().slice(0, 500) ?? '',
        }
      })
      return captured
    },
    validateSelection(id) {
      const target = targets.get(id)
      if (!editor?.getRootElement()?.isConnected || !target) return false
      return editor
        .getEditorState()
        .read(
          () =>
            valid(target.bookmark) &&
            target.bookmark.getTextContent() === target.before &&
            structure(target.bookmark) === target.structure,
        )
    },
    applyReplacement(id, markdown) {
      const target = targets.get(id)
      if (!editor || !target || !adapter.validateSelection(id))
        throw new Error('原文已变化，请重新选择。')
      const replacement = target.inline && markdown !== '' ? inlineFragment(markdown) : markdown
      // Consume before updating, so duplicate accepts cannot apply twice.
      targets.delete(id)
      editor.update(
        () => {
          if (
            !valid(target.bookmark) ||
            target.bookmark.getTextContent() !== target.before ||
            structure(target.bookmark) !== target.structure
          )
            throw new Error('原文已变化，请重新选择。')
          $setSelection(target.bookmark.clone())
          if (markdown === '') {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) selection.removeText()
          } else insert!(replacement)
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      )
    },
    releaseSelection(id) {
      targets.delete(id)
    },
  }
  const plugin = realmPlugin<void>({
    init(realm) {
      realm.sub(rootEditor$, (root) => {
        if (editor !== root) {
          targets.clear()
          insertions.clear()
        }
        editor = root
        insert = root ? (markdown) => realm.pub(insertMarkdown$, markdown) : null
      })
    },
    update(realm) {
      // Realm plugins initialize once; updates also bind after hot reload and prop changes.
      const root = realm.getValue(rootEditor$)
      if (editor !== root) {
        targets.clear()
        insertions.clear()
      }
      editor = root
      insert = root ? (markdown) => realm.pub(insertMarkdown$, markdown) : null
    },
  })
  return { adapter, plugin }
}
