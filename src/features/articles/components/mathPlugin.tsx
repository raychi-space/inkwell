import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DecoratorNode,
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
} from 'lexical'
import {
  realmPlugin,
  addLexicalNode$,
  addImportVisitor$,
  addExportVisitor$,
  addSyntaxExtension$,
  addMdastExtension$,
  addToMarkdownExtension$,
  insertDecoratorNode$,
  readOnly$,
  type MdastImportVisitor,
  type LexicalExportVisitor,
  IS_BOLD,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_UNDERLINE,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
} from '@mdxeditor/editor'
import { useCellValue, usePublisher } from '@mdxeditor/gurx'
import { math } from 'micromark-extension-math'
import { mathFromMarkdown, mathToMarkdown } from 'mdast-util-math'
import type { Math as MathAst, InlineMath } from 'mdast-util-math'
import type { PhrasingContent } from 'mdast'
import { MathFormula } from '../../../shared/ui/MathFormula'

type SerializedMath = SerializedLexicalNode & { value: string; display: boolean; format?: number }
export class MathNode extends DecoratorNode<ReactNode> {
  __value: string
  __display: boolean
  __format: number
  constructor(value: string, display: boolean, key?: NodeKey, format = 0) {
    super(key)
    this.__value = value
    this.__display = display
    this.__format = format
  }
  static getType() {
    return 'math'
  }
  static clone(node: MathNode) {
    return new MathNode(node.__value, node.__display, node.__key, node.__format)
  }
  static importJSON(node: SerializedMath) {
    return new MathNode(node.value, node.display, undefined, node.format ?? 0)
  }
  exportJSON(): SerializedMath {
    return {
      ...super.exportJSON(),
      type: 'math',
      version: 1,
      value: this.__value,
      display: this.__display,
      format: this.__format,
    }
  }
  exportDOM() {
    const element = document.createElement(this.__display ? 'div' : 'span')
    // External clipboard targets receive readable source, rather than an empty decorator.
    element.textContent = this.getTextContent()
    return { element }
  }
  createDOM() {
    const element = document.createElement(this.__display ? 'div' : 'span')
    element.className = this.__display ? 'editor-math-block' : 'editor-math-inline'
    return element
  }
  updateDOM() {
    return false
  }
  isInline() {
    return !this.__display
  }
  getTextContent() {
    return (this.__display ? '$$' : '$') + this.__value + (this.__display ? '$$' : '$')
  }
  setValue(value: string) {
    this.getWritable().__value = value
  }
  decorate(editor: LexicalEditor) {
    return (
      <FormulaNodeView
        editor={editor}
        nodeKey={this.getKey()}
        value={this.__value}
        display={this.__display}
        format={this.__format}
      />
    )
  }
}

function FormulaDialog({
  initial,
  display: initialDisplay,
  chooseMode = false,
  onSave,
  onClose,
  onDelete,
}: {
  initial: string
  display: boolean
  chooseMode?: boolean
  onSave: (value: string, display: boolean) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState(initial),
    [display, setDisplay] = useState(initialDisplay)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      className="math-dialog"
      ref={ref}
      onCancel={onClose}
      onClose={onClose}
      aria-label={chooseMode ? '插入公式' : '编辑公式'}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (value.trim()) onSave(value, display)
        }}
      >
        <h3>{chooseMode ? '插入公式' : '编辑公式'}</h3>
        {chooseMode && (
          <label>
            显示方式
            <select
              value={display ? 'block' : 'inline'}
              onChange={(event) => setDisplay(event.target.value === 'block')}
            >
              <option value="inline">行内公式</option>
              <option value="block">独立公式</option>
            </select>
          </label>
        )}
        <label>
          公式源码
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="例如：\\frac{a}{b}"
          />
        </label>
        <div className="math-dialog-preview" aria-label="公式预览">
          <MathFormula value={value} display={display} />
        </div>
        <div className="actions">
          <button type="submit" className="primary" disabled={!value.trim()}>
            保存公式
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete}>
              删除公式
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
function FormulaNodeView({
  editor,
  nodeKey,
  value,
  display,
  format,
}: {
  editor: LexicalEditor
  nodeKey: NodeKey
  value: string
  display: boolean
  format: number
}) {
  const [open, setOpen] = useState(false)
  const readOnly = useCellValue(readOnly$)
  useEffect(() => {
    if (readOnly) setOpen(false)
  }, [readOnly])
  function change(next: string | null) {
    if (!editor.isEditable()) {
      setOpen(false)
      return
    }
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey)
        if (node instanceof MathNode) {
          if (next === null) node.remove()
          else node.setValue(next)
        }
      },
      { tag: HISTORY_PUSH_TAG, discrete: true },
    )
    setOpen(false)
  }
  let formula = <MathFormula value={value} display={display} />
  if (format & IS_ITALIC) formula = <em>{formula}</em>
  if (format & IS_BOLD) formula = <strong>{formula}</strong>
  if (format & IS_STRIKETHROUGH) formula = <del>{formula}</del>
  if (format & IS_UNDERLINE) formula = <u>{formula}</u>
  if (format & IS_SUBSCRIPT) formula = <sub>{formula}</sub>
  if (format & IS_SUPERSCRIPT) formula = <sup>{formula}</sup>
  return (
    <span contentEditable={false}>
      <button
        type="button"
        className="editor-math-trigger"
        aria-label={'编辑公式：' + value}
        onClick={() => setOpen(true)}
        disabled={readOnly}
      >
        {formula}
      </button>
      {open && !readOnly && (
        <FormulaDialog
          initial={value}
          display={display}
          onSave={(next) => change(next)}
          onClose={() => setOpen(false)}
          onDelete={() => change(null)}
        />
      )}
    </span>
  )
}

export function InsertMath() {
  const insert = usePublisher(insertDecoratorNode$),
    readOnly = useCellValue(readOnly$)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (readOnly) setOpen(false)
  }, [readOnly])
  return (
    <>
      <button
        type="button"
        className="math-toolbar-button"
        aria-label="插入公式"
        disabled={readOnly}
        onClick={() => setOpen(true)}
      >
        ∑ 公式
      </button>
      {open && !readOnly && (
        <FormulaDialog
          initial=""
          display={false}
          chooseMode
          onClose={() => setOpen(false)}
          onSave={(value, display) => {
            setOpen(false)
            if (!readOnly) insert(() => new MathNode(value, display))
          }}
        />
      )}
    </>
  )
}
const importMath: MdastImportVisitor<MathAst | InlineMath> = {
  testNode: (node) => node.type === 'math' || node.type === 'inlineMath',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto(
      new MathNode(
        mdastNode.value,
        mdastNode.type === 'math',
        undefined,
        actions.getParentFormatting(),
      ),
    )
  },
}
const exportMath: LexicalExportVisitor<MathNode, MathAst | InlineMath> = {
  testLexicalNode: (node): node is MathNode => node instanceof MathNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    if (lexicalNode.__display) {
      actions.addAndStepInto('math', { value: lexicalNode.__value }, false)
      return
    }
    let result: PhrasingContent = { type: 'inlineMath', value: lexicalNode.__value }
    const format = lexicalNode.__format
    if (format & IS_ITALIC) result = { type: 'emphasis', children: [result] }
    if (format & IS_BOLD) result = { type: 'strong', children: [result] }
    if (format & IS_STRIKETHROUGH) result = { type: 'delete', children: [result] }
    for (const [flag, name] of [
      [IS_UNDERLINE, 'u'],
      [IS_SUBSCRIPT, 'sub'],
      [IS_SUPERSCRIPT, 'sup'],
    ] as const) {
      if (format & flag)
        result = { type: 'mdxJsxTextElement', name, attributes: [], children: [result] }
    }
    actions.appendToParent(mdastParent, result)
  },
}
export const mathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: MathNode,
      [addSyntaxExtension$]: math(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addToMarkdownExtension$]: mathToMarkdown(),
      [addImportVisitor$]: importMath,
      [addExportVisitor$]: exportMath,
    })
  },
})
