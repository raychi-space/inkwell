import { realmPlugin, rootEditor$, insertMarkdown$, type MDXEditorMethods } from '@mdxeditor/editor'
import {
  $getSelection,
  $isRangeSelection,
  $getNodeByKey,
  $isTextNode,
  $isParagraphNode,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type RangeSelection,
} from 'lexical'
import type { EditorAgentAdapter, SelectionSnapshot } from '../../../shared/types/editor'

/** Targets belong to one root editor instance. No Markdown offsets or string search. */
export function createEditorAgentAdapter(methods: () => MDXEditorMethods | null) {
  let editor: LexicalEditor | null = null
  let insert: ((markdown: string) => void) | null = null
  const targets = new Map<
    string,
    { bookmark: RangeSelection; before: string; anchor: HTMLElement | null }
  >()
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
    return bookmark.getNodes().every((node) => {
      const paragraph = $isParagraphNode(node) ? node : node.getParent()
      return (
        !!paragraph &&
        $isParagraphNode(paragraph) &&
        paragraph.getParent()?.getType() === 'root' &&
        paragraph
          .getChildren()
          .every((child) => $isTextNode(child) && child.getFormat() === 0 && child.isSimpleText())
      )
    })
  }
  const adapter: EditorAgentAdapter = {
    getCurrentMarkdown: () => methods()?.getMarkdown() ?? '',
    applyDocument(before, markdown) {
      const current = methods()
      if (!current || current.getMarkdown() !== before)
        throw new Error('正文已变化，请重新生成修改建议。')
      current.setMarkdown(markdown)
      targets.clear()
    },
    captureSelection() {
      if (!editor?.getRootElement()?.isConnected) return null
      let captured: SelectionSnapshot | null = null
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed() || !valid(selection)) return
        const before = selection.getTextContent()
        const exported = methods()?.getSelectionMarkdown() ?? ''
        // MDXEditor can serialize empty unselected siblings at selection boundaries.
        // Preserve actual selected newlines and all text/space content.
        const start = before.startsWith('\n') ? exported : exported.replace(/^\n+/, '')
        const beforeMarkdown = before.endsWith('\n') ? start : start.replace(/\n+$/, '')
        if (!before.trim() || !beforeMarkdown.trim()) return
        const selectionId = crypto.randomUUID()
        const nodes = selection.getNodes()
        const first = nodes[0].getTopLevelElementOrThrow()
        const last = nodes[nodes.length - 1].getTopLevelElementOrThrow()
        const anchor = editor!.getElementByKey(first.getKey())
        const existing = [...targets.entries()][0]
        if (
          existing &&
          existing[1].bookmark.anchor.is(selection.anchor) &&
          existing[1].bookmark.focus.is(selection.focus) &&
          existing[1].before === before
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
          anchor,
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
        .read(() => valid(target.bookmark) && target.bookmark.getTextContent() === target.before)
    },
    applyReplacement(id, markdown) {
      const target = targets.get(id)
      if (!editor || !target || !adapter.validateSelection(id))
        throw new Error('原文已变化，请重新选择。')
      // Consume before updating, so duplicate accepts cannot apply twice.
      targets.delete(id)
      editor.update(
        () => {
          if (!valid(target.bookmark) || target.bookmark.getTextContent() !== target.before)
            throw new Error('原文已变化，请重新选择。')
          $setSelection(target.bookmark.clone())
          if (markdown === '') {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) selection.removeText()
          } else insert!(markdown)
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      )
    },
    releaseSelection(id) {
      targets.delete(id)
    },
    getAnchor(id) {
      return targets.get(id)?.anchor ?? null
    },
  }
  const plugin = realmPlugin<void>({
    init(realm) {
      realm.sub(rootEditor$, (root) => {
        if (editor !== root) targets.clear()
        editor = root
        insert = root ? (markdown) => realm.pub(insertMarkdown$, markdown) : null
      })
    },
    update(realm) {
      // Realm plugins initialize once; updates also bind after hot reload and prop changes.
      const root = realm.getValue(rootEditor$)
      if (editor !== root) targets.clear()
      editor = root
      insert = root ? (markdown) => realm.pub(insertMarkdown$, markdown) : null
    },
  })
  return { adapter, plugin }
}
