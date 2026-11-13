import { useRef, useState } from 'react'
import { RichEditor } from './RichEditor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import type {
  EditorAgentAdapter,
  SelectionSnapshot,
  InsertionSnapshot,
} from '../../../shared/types/editor'
import type { Article } from '../types'
export function AgentEditorFixture() {
  const editor = useRef<MDXEditorMethods>(null),
    agent = useRef<EditorAgentAdapter>(null)
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [insertion, setInsertion] = useState<InsertionSnapshot | null>(null)
  const [instance, setInstance] = useState(0)
  const [notice, setNotice] = useState(''),
    [markdown, setMarkdown] = useState('')
  const [replacement, setReplacement] = useState('新的替换文字')
  const article = {
    id: 'editor-fixture',
    bodyMarkdown:
      new URLSearchParams(location.search).get('markdown') ?? '相同原文\n\n相同原文\n\n最后一段。',
  } as Article
  return (
    <main>
      <h1>选区适配器验证</h1>
      <div style={{ maxWidth: 800 }}>
        <RichEditor
          key={instance}
          article={article}
          editorRef={editor}
          agentRef={agent}
          readOnly={!!selection}
          onDirty={() => setMarkdown(editor.current?.getMarkdown() ?? '')}
          onPending={() => {}}
          onError={setNotice}
        />
      </div>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const captured = agent.current?.captureSelection()
          if (!captured) setNotice('请选择支持的文字选区。')
          else {
            setSelection(captured)
            setNotice('选区已捕获')
          }
        }}
      >
        交给助手
      </button>
      <input aria-label="助手输入" />
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const captured = agent.current?.captureInsertion()
          if (!captured) setNotice('请设置有效光标。')
          else {
            setInsertion(captured)
            setNotice('光标已捕获')
          }
        }}
      >
        捕获光标
      </button>
      {insertion && (
        <aside aria-label="光标建议">
          <button
            onClick={() => {
              try {
                agent.current?.applyInsertion(insertion.insertionId, replacement)
                setInsertion(null)
                setMarkdown(editor.current?.getMarkdown() ?? '')
                setNotice('已插入')
              } catch (e) {
                setNotice(String(e))
              }
            }}
          >
            确认光标插入
          </button>
          <button
            onClick={() => {
              agent.current?.releaseInsertion(insertion.insertionId)
              setInsertion(null)
            }}
          >
            取消光标插入
          </button>
        </aside>
      )}
      <textarea
        aria-label="建议 Markdown"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      />
      <button onClick={() => editor.current?.setMarkdown('原文已从外部改变。')}>
        外部修改原文
      </button>
      <button onClick={() => setInstance((v) => v + 1)}>重新挂载编辑器</button>
      {selection && (
        <aside role="region" aria-label="选区修改建议">
          <pre style={{ color: 'red' }}>{selection.beforeMarkdown}</pre>
          <pre style={{ color: 'green' }}>新的替换文字</pre>
          <button
            onClick={() => {
              try {
                agent.current?.applyReplacement(selection.selectionId, replacement)
                setSelection(null)
                setMarkdown(editor.current?.getMarkdown() ?? '')
              } catch (e) {
                setNotice(String(e))
              }
            }}
          >
            接受
          </button>
          <button
            onClick={() => {
              agent.current?.releaseSelection(selection.selectionId)
              setSelection(null)
            }}
          >
            拒绝
          </button>
        </aside>
      )}
      <button onClick={() => setMarkdown(editor.current?.getMarkdown() ?? '')}>
        导出 Markdown
      </button>
      <pre aria-label="导出结果">{markdown}</pre>
      <p role="status">{notice}</p>
    </main>
  )
}
