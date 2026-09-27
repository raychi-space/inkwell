import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import {
  MDXEditor, type MDXEditorMethods,
  headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin,
  linkPlugin, linkDialogPlugin, imagePlugin, tablePlugin,
  codeBlockPlugin, codeMirrorPlugin, markdownShortcutPlugin, toolbarPlugin,
  UndoRedo, BlockTypeSelect, BoldItalicUnderlineToggles,
  ListsToggle, CreateLink, InsertImage, InsertTable, InsertCodeBlock,
} from '@mdxeditor/editor'
import { api, login, logout, upload, type Article, type Page, type Session } from './api'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}

function RichEditor({ article, editorRef, onDirty, onPending, onError }: {
  article: Article
  editorRef: RefObject<MDXEditorMethods | null>
  onDirty: () => void
  onPending: (change: number) => void
  onError: (message: string) => void
}) {
  const plugins = useMemo(() => [
    headingsPlugin(), listsPlugin(), quotePlugin(), thematicBreakPlugin(),
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
  ], [article.id, onPending, onError])

  return <MDXEditor
    ref={editorRef}
    markdown={article.bodyMarkdown}
    plugins={plugins}
    onChange={onDirty}
    contentEditableClassName="editable-prose"
  />
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [current, setCurrent] = useState<Article | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pendingUploads, setPendingUploads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const editorRef = useRef<MDXEditorMethods>(null)
  const markDirty = useCallback(() => setDirty(true), [])
  const changePending = useCallback((n: number) => setPendingUploads(v => Math.max(0, v + n)), [])

  useEffect(() => {
    api<Session>('/api/v1/auth/session').then(setSession).catch(error => setNotice(errorMessage(error)))
  }, [])

  useEffect(() => {
    if (!session?.authenticated) return
    void refresh()
  }, [session?.authenticated])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty || pendingUploads > 0) event.preventDefault()
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty, pendingUploads])

  async function refresh() {
    try {
      const result = await api<Page<Article>>('/api/v1/admin/articles?pageSize=50')
      setArticles(result.items)
    } catch (error) { setNotice(errorMessage(error)) }
  }

  function edit(article: Article) {
    setCurrent(article)
    setTitle(article.title)
    setSlug(article.slug.startsWith('draft-') ? '' : article.slug)
    setSummary(article.summary)
    setTags(article.tags.join(', '))
    setDirty(false)
    setNotice('')
  }

  function canLeave() {
    if (pendingUploads > 0) { setNotice('请等待图片上传完成。'); return false }
    return !dirty || window.confirm('当前修改尚未保存，确定离开吗？')
  }

  async function open(id: string) {
    if (!canLeave()) return
    try { edit(await api<Article>(`/api/v1/admin/articles/${id}`)) }
    catch (error) { setNotice(errorMessage(error)) }
  }

  async function create() {
    if (!canLeave()) return
    setBusy(true)
    try {
      const created = await api<Article>('/api/v1/admin/articles', { method: 'POST', body: '{}' })
      edit(created)
      await refresh()
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function save(): Promise<Article | null> {
    if (!current) return null
    if (pendingUploads > 0) { setNotice('请等待图片上传完成。'); return null }
    setBusy(true)
    try {
      const saved = await api<Article>(`/api/v1/admin/articles/${current.id}`, {
        method: 'PUT', body: JSON.stringify({
          version: current.version, title, slug: slug || current.slug,
          summary, bodyMarkdown: editorRef.current?.getMarkdown() ?? current.bodyMarkdown,
          tags: tags.split(',').map(tag => tag.trim()).filter(Boolean), coverUrl: current.coverUrl,
        }),
      })
      setCurrent(saved)
      setDirty(false)
      setNotice('工作稿已保存，公开内容未改变。')
      await refresh()
      return saved
    } catch (error) { setNotice(errorMessage(error)); return null }
    finally { setBusy(false) }
  }

  async function publish() {
    const saved = await save()
    if (!saved) return
    setBusy(true)
    try {
      const published = await api<Article>(`/api/v1/admin/articles/${saved.id}/publish`, {
        method: 'POST', body: JSON.stringify({ expectedVersion: saved.version }),
      })
      setCurrent(published)
      setNotice('文章已发布，访客现在可以阅读。')
      await refresh()
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function unpublish() {
    if (!current) return
    const saved = dirty ? await save() : current
    if (!saved) return
    setBusy(true)
    try {
      const draft = await api<Article>(`/api/v1/admin/articles/${saved.id}/unpublish`, {
        method: 'POST', body: JSON.stringify({ expectedVersion: saved.version }),
      })
      setCurrent(draft)
      setNotice('文章已撤回，公开页面与图片不再提供新的读取。')
      await refresh()
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try { setSession(await login(username, password)); setPassword(''); setNotice('') }
    catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function signOut() {
    if (!canLeave()) return
    try { await logout(); setSession({ authenticated: false, username: null }); setCurrent(null) }
    catch (error) { setNotice(errorMessage(error)) }
  }

  if (session === null || !session.authenticated) return <main className="login-screen">
    <div className="login-card">
      <p className="eyebrow">RAYCHI · CONTENT STUDIO</p>
      <h1>墨池</h1>
      <p className="muted">在这里写下文章，再决定何时让它被看见。</p>
      <form onSubmit={signIn}>
        <label>站长账号<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
        <label>密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="primary" disabled={busy}>登录</button>
      </form>
      {notice && <p className="notice error" role="alert">{notice}</p>}
    </div>
  </main>

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span>Raychi</span><strong>墨池</strong><small>内容管理</small></div>
      <button className="new-button" onClick={create} disabled={busy}>＋ 新建文章</button>
      <div className="sidebar-title">文章 <span>{articles.length}</span></div>
      <nav className="article-nav" aria-label="文章列表">
        {articles.map(article => <button key={article.id}
          className={current?.id === article.id ? 'selected' : ''} onClick={() => void open(article.id)}>
          <span>{article.title || '未命名文章'}</span>
          <small>{article.status === 'PUBLISHED' ? (article.hasUnpublishedChanges ? '已发布 · 有待发布修改' : '已发布') : '草稿'}</small>
        </button>)}
      </nav>
      <div className="sidebar-foot"><span>{session.username}</span><button onClick={signOut}>退出</button></div>
    </aside>
    <main className="workspace">
      {current ? <>
        <header className="editor-head">
          <div><p className="eyebrow">{current.status === 'PUBLISHED' ? '已发布文章' : '私人草稿'}{dirty ? ' · 尚未保存' : ''}</p>
            <h1>{title || '未命名文章'}</h1></div>
          <div className="actions">
            <button onClick={() => void save()} disabled={busy || pendingUploads > 0}>保存工作稿</button>
            <button className="primary" onClick={() => void publish()} disabled={busy || pendingUploads > 0}>发布更新</button>
            {current.status === 'PUBLISHED' && <button onClick={() => void unpublish()} disabled={busy}>撤回</button>}
          </div>
        </header>
        <section className="editor-page">
          <div className="fields">
            <label>标题<input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }} placeholder="给这篇文章一个标题" /></label>
            <label>地址别名<input value={slug} onChange={e => { setSlug(e.target.value); setDirty(true) }} disabled={!!current.publishedAt} placeholder="例如 my-first-article" /></label>
            <label>摘要<textarea value={summary} onChange={e => { setSummary(e.target.value); setDirty(true) }} rows={2} placeholder="在列表中介绍这篇文章" /></label>
            <label>标签<input value={tags} onChange={e => { setTags(e.target.value); setDirty(true) }} placeholder="用逗号分隔" /></label>
          </div>
          <div className="editor-label"><strong>正文</strong><span>直接编辑排版后的内容 · 粘贴图片会自动上传</span></div>
          <div className="editor-surface">
            <RichEditor key={current.id} article={current} editorRef={editorRef}
              onDirty={markDirty} onPending={changePending}
              onError={setNotice} />
          </div>
          {pendingUploads > 0 && <p className="upload-state" role="status">正在上传 {pendingUploads} 张图片…</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
        </section>
      </> : <div className="empty-state"><p className="eyebrow">WELCOME TO INKWELL</p><h1>从一篇文章开始。</h1>
        <p>选择左侧文章继续编辑，或新建一篇草稿。</p><button className="primary" onClick={create}>新建文章</button>
        {notice && <p className="notice error" role="alert">{notice}</p>}</div>}
    </main>
  </div>
}
