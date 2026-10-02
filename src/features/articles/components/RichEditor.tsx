import { useEffect, useMemo, type RefObject } from 'react'
import {
  MDXEditor, type MDXEditorMethods,
  headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin,
  linkPlugin, linkDialogPlugin, imagePlugin, tablePlugin,
  codeBlockPlugin, codeMirrorPlugin, markdownShortcutPlugin, toolbarPlugin,
  UndoRedo, BlockTypeSelect, BoldItalicUnderlineToggles,
  ListsToggle, CreateLink, InsertImage, InsertTable, InsertCodeBlock,
} from '@mdxeditor/editor'
import { upload } from '../api'
import type { Article } from '../types'
import type { EditorAgentAdapter } from '../../ai/types'
import { createEditorAgentAdapter } from './editorAgentAdapter'
import { errorMessage } from '../../../shared/lib/errors'

export function RichEditor({ article, editorRef, onDirty, onPending, onError, onReady, agentRef, readOnly = false }: {
  article: Article
  agentRef?: RefObject<EditorAgentAdapter | null>
  readOnly?: boolean
  editorRef: RefObject<MDXEditorMethods | null>
  onReady?: () => void
  onDirty: () => void
  onPending: (change: number) => void
  onError: (message: string) => void
}) {
  const agent = useMemo(() => createEditorAgentAdapter(() => editorRef.current), [article.id, editorRef])
  if (agentRef) agentRef.current = agent.adapter
  useEffect(() => { onReady?.() }, [article.id, onReady])
  const plugins = useMemo(() => [
    agent.plugin(), headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(),
    linkPlugin(), linkDialogPlugin(), tablePlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
    codeMirrorPlugin({ codeBlockLanguages: { txt: 'Text', js: 'JavaScript', ts: 'TypeScript',
      json: 'JSON', bash: 'Bash', java: 'Java', python: 'Python' } }),
    markdownShortcutPlugin(),
    imagePlugin({
      disableImageResize: true,
      imageUploadHandler: async (file: File) => {
        onPending(1)
        try {
          const result = await upload(article.id, file)
          return result.url
        } catch (error) {
          onError(errorMessage(error))
          throw error
        } finally {
          onPending(-1)
        }
      },
      imagePreviewHandler: async (source: string) => source.startsWith('/api/v1/public/assets/')
        ? source.replace('/api/v1/public/assets/', '/api/v1/admin/assets/')
        : source,
    }),
    toolbarPlugin({ toolbarContents: () => <>
      <UndoRedo />
      <BlockTypeSelect />
      <BoldItalicUnderlineToggles />
      <ListsToggle />
      <CreateLink />
      <InsertImage />
      <InsertTable />
      <InsertCodeBlock />
    </> }),
  ], [article.id, onPending, onError, agent])

  return <MDXEditor
    className={readOnly ? 'agent-editor-locked' : undefined}
    ref={editorRef}
    readOnly={readOnly}
    markdown={article.bodyMarkdown}
    plugins={plugins}
    onChange={onDirty}
    contentEditableClassName="editable-prose"
  />
}
