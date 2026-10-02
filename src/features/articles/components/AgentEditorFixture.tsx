import { useRef, useState } from 'react'
import { RichEditor } from './RichEditor'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import type { EditorAgentAdapter, SelectionSnapshot } from '../../../shared/types/editor'
import type { Article } from '../types'
export function AgentEditorFixture() {
  const editor = useRef<MDXEditorMethods>(null),
    agent = useRef<EditorAgentAdapter>(null)
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null)
  const [instance, setInstance] = useState(0)
  const [notice, setNotice] = useState(''),
    [markdown, setMarkdown] = useState('')
  const article = {
    id: 'editor-fixture',
    bodyMarkdown: '相同原文\n\n相同原文\n\n最后一段。',
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
          if (!captured) setNotice('仅支持普通段落的无格式文字选区。')
          else {
            setSelection(captured)
            setNotice('选区已捕获')
          }
        }}
      >
        交给助手
      </button>
      <input aria-label="助手输入" />
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
                agent.current?.applyReplacement(selection.selectionId, '新的替换文字')
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
