import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { getSession, login, logout, LoginScreen, type Session } from '../features/auth'
import { listArticles, getArticle, createArticle, saveArticle, publishArticle, unpublishArticle, ArticleSidebar, ContentDashboard, RichEditor, type Article } from '../features/articles'
import { categories, tags, addCategory, addTag } from '../features/taxonomy'
import { SettingsEditor, getSettings, type SiteSettings } from '../features/settings'
import { AgentSettings } from '../features/ai/AgentSettings'
import { WritingAssistant } from '../features/ai/WritingAssistant'
import { assistants as loadAssistants } from '../features/ai/api'
import type { Assistant, EditorAgentAdapter } from '../features/ai/types'
import { errorMessage } from '../shared/lib/errors'
import { ContentMetadata } from '../features/articles/components/ContentMetadata'
import { useAutomaticSummary } from '../features/ai/useAutomaticSummary'

const AgentEditorFixture = lazy(() => import('../features/articles/components/AgentEditorFixture').then(module => ({ default: module.AgentEditorFixture })))
const typeNames = { ARTICLE: '文章', POST: '帖子' }

export default function App() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('editor-agent-fixture')) return <Suspense fallback={<p>加载中</p>}><AgentEditorFixture /></Suspense>
  return <Studio />
}

function Studio() {
  const [session, setSession] = useState<Session | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)
  const rememberSettings = useCallback((value: SiteSettings) => {
    setSiteSettings(value); setAvatarUrl(value.avatarUrl); setSiteName(value.siteName)
  }, [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { const value = localStorage.getItem('raychi.sidebar.collapsed'); return value === null ? window.matchMedia('(max-width:680px)').matches : value === 'true' } catch { return false }
  })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [current, setCurrent] = useState<Article | null>(null)
  const [view, setView] = useState<'content' | 'drafts' | 'settings' | 'ai'>('content')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [category, setCategory] = useState('未分类')
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [tagNames, setTagNames] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newTag, setNewTag] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [dirty, setDirty] = useState(false)
  const [pendingUploads, setPendingUploads] = useState(0)
  const transfers = useRef(0)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [notice, setNotice] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(true)
  const [agentLocked, setAgentLocked] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const agentRef = useRef<EditorAgentAdapter>(null)
  const previewHost = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MDXEditorMethods>(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([])
  const [assistantNotice, setAssistantNotice] = useState('')
  const editorReady = useCallback(() => setDocumentRevision(v => v + 1), [])
  const applySummary = useCallback((value: string) => { setSummary(value); setDirty(true) }, [])
  const automaticSummary = useAutomaticSummary({
    documentId: current?.type === 'ARTICLE' ? current.id : null, assistantId: availableAssistants.some(v => v.id === selectedAssistantId) ? selectedAssistantId : '', title, summary,
    initialBody: current?.bodyMarkdown ?? '', revision: documentRevision, persisting: busy || pendingUploads > 0, isPersisting: () => saving.current || transfers.current > 0,
    getMarkdown: () => editorRef.current?.getMarkdown() ?? null, onApply: applySummary,
  })
  const markDirty = useCallback(() => { setDirty(true); setDocumentRevision(v => v + 1) }, [])
  const changePending = useCallback((n: number) => { transfers.current = Math.max(0, transfers.current + n); setPendingUploads(transfers.current) }, [])

  useEffect(() => {
    getSession().then(setSession).catch(error => setNotice(errorMessage(error)))
  }, [])

  useEffect(() => {
    if (!session?.authenticated) return
    void refresh()
    void refreshTaxonomy()
    let active = true
    void getSettings().then(value => { if (active) rememberSettings(value) }).catch(() => { if (active) setAvatarUrl(null) })
    return () => { active = false }
  }, [session?.authenticated, rememberSettings])

  function toggleSidebar() {
    setSidebarCollapsed(value => {
      try { localStorage.setItem('raychi.sidebar.collapsed', String(!value)) } catch { /* Session-only preference when storage is unavailable. */ }
      return !value
    })
  }

  useEffect(() => {
    if (current?.type !== 'ARTICLE') return
    let active = true
    setAvailableAssistants([])
    setAssistantNotice('')
    void loadAssistants().then(items => {
      if (!active) return
      const enabled = items.filter(item => item.enabled)
      setAvailableAssistants(enabled)
      setSelectedAssistantId(id => enabled.some(item => item.id === id) ? id : enabled[0]?.id ?? '')
    }).catch(error => { if (active) { setSelectedAssistantId(''); setAssistantNotice(errorMessage(error)) } })
    return () => { active = false }
  }, [current?.id])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty || pendingUploads > 0) event.preventDefault()
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty, pendingUploads])

  async function refresh() {
    try {
      const first = await listArticles()
      const all = [...first.items]
      const pages = Math.ceil(first.total / first.pageSize)
      for (let page = 2; page <= pages; page++) {
        const result = await listArticles(page)
        all.push(...result.items)
      }
      setArticles(all)
    } catch (error) { setNotice(errorMessage(error)) }
  }

  async function refreshTaxonomy() {
    try {
      const [allCategories, allTags] = await Promise.all([categories(), tags()])
      setCategoryNames(allCategories.map(item => item.name))
      setTagNames(allTags.map(item => item.name))
    } catch (error) { setNotice(errorMessage(error)) }
  }

  function edit(article: Article) {
    setCurrent(article)
    setTitle(article.title)
    setSlug(article.slug.startsWith('draft-') ? '' : article.slug)
    setSummary(article.summary)
    setBody(article.bodyMarkdown)
    setSelectedTags(article.tags)
    setCategory(article.category ?? '未分类')
    setCoverUrl(article.coverUrl ?? '')
    setDirty(false)
    setNotice('')
    setView(article.status === 'PUBLISHED' ? 'content' : 'drafts')
  }

  function canLeave() {
    if (pendingUploads > 0) { setNotice('请等待图片上传完成。'); return false }
    return !dirty || window.confirm('当前修改尚未保存，确定离开吗？')
  }

  async function open(id: string) {
    if (!canLeave()) return
    try { edit(await getArticle(id)) }
    catch (error) { setNotice(errorMessage(error)) }
  }

  async function create(type: Article['type']) {
    if (!canLeave()) return
    setBusy(true)
    try {
      const created = await createArticle(type)
      edit(created)
      await refresh()
    } catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function addName(kind: 'category' | 'tag') {
    const name = (kind === 'category' ? newCategory : newTag).trim()
    if (!name) return
    try {
      if (kind === 'category') { await addCategory(name); setCategory(name); setNewCategory('') }
      else { await addTag(name); setSelectedTags([...selectedTags, name]); setNewTag('') }
      setDirty(true)
      await refreshTaxonomy()
    } catch (error) { setNotice(errorMessage(error)) }
  }

  async function save(): Promise<Article | null> {
    if (!current) return null
    if (pendingUploads > 0) { setNotice('请等待图片上传完成。'); return null }
    const markdown = current.type === 'ARTICLE' ? editorRef.current?.getMarkdown() ?? current.bodyMarkdown : body
    if (current.type !== 'ARTICLE' && /!\[[^\]]*\]\s*\(|<\s*img\b/i.test(markdown)) {
      setNotice('帖子和思考不支持图片，请删除图片引用后再保存。'); return null
    }
    saving.current = true
    setBusy(true)
    try {
      const saved = await saveArticle(current.id, {
        version: current.version, title, slug: slug || current.slug,
        summary, bodyMarkdown: markdown,
        tags: selectedTags,
        category: current.type === 'POST' ? null : category,
        coverUrl: current.type === 'ARTICLE' ? coverUrl || null : null,
      })
      setCurrent(saved)
      setDirty(false)
      setNotice('工作稿已保存，公开内容未改变。')
      await refresh()
      return saved
    } catch (error) { setNotice(errorMessage(error)); return null }
    finally { saving.current = false; setBusy(false) }
  }

  async function publish() {
    const saved = await save()
    if (!saved) return
    setBusy(true)
    try {
      const published = await publishArticle(saved.id, saved.version)
      setCurrent(published)
      setView('content')
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
      const draft = await unpublishArticle(saved.id, saved.version)
      setCurrent(draft)
      setView('drafts')
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
    try { await logout(); setSession({ authenticated: false, username: null }); setCurrent(null); setSiteSettings(null); setAvatarUrl(null); setSiteName('') }
    catch (error) { setNotice(errorMessage(error)) }
  }

  function showSection(section: 'content' | 'drafts') {
    if (!canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView(section)
    setNotice('')
  }

  function showSettings() {
    if (!canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('settings')
    setNotice('')
  }

  if (session === null || !session.authenticated) return <LoginScreen username={username} password={password}
    busy={busy} notice={notice} onUsername={setUsername} onPassword={setPassword} onSubmit={signIn} />

  return <div className={'shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {!sidebarCollapsed && <button className="sidebar-backdrop" aria-label="收起侧边栏遮罩" onClick={toggleSidebar} />}
    <ArticleSidebar active={view} username={session.username} siteName={siteName} avatarUrl={avatarUrl} collapsed={sidebarCollapsed} onToggle={toggleSidebar}
      onContent={() => showSection('content')} onDrafts={() => showSection('drafts')}
      onAI={() => { if (canLeave()) { setCurrent(null); setDirty(false); setView('ai'); setNotice('') } }} onSettings={showSettings} onSignOut={() => void signOut()} />
    {view === 'ai' ? <AgentSettings /> : view === 'settings' ? <SettingsEditor initialValue={siteSettings} onLoaded={rememberSettings} onSaved={rememberSettings} /> : current ? <main className="workspace studio-page editor-workspace">
        <header className="studio-head editor-head">
          <div><button className="back-link" onClick={() => showSection(view === 'drafts' ? 'drafts' : 'content')}>← 返回{view === 'drafts' ? '草稿箱' : '内容管理'}</button><p className="eyebrow">{current.status === 'PUBLISHED' ? '已发布' : '私人草稿'} · {typeNames[current.type]}{dirty ? ' · 尚未保存' : ''}</p>
            <h1>写{current.type === 'ARTICLE' ? '文章' : '帖子'}</h1></div>
          <div className="actions">
            {current.type === 'ARTICLE' && <button disabled={agentBusy || agentLocked} onClick={() => setAssistantOpen(v => !v)}>{assistantOpen ? '收起助手' : '写作助手'}</button>}
            <button onClick={() => void save()} disabled={busy || pendingUploads > 0 || agentLocked || agentBusy}>保存</button>
            <button className="primary" onClick={() => void publish()} disabled={busy || pendingUploads > 0 || agentLocked || agentBusy}>{current.status === 'PUBLISHED' ? '发布更新' : '发布'}</button>
            {current.status === 'PUBLISHED' && <button onClick={() => void unpublish()} disabled={busy || agentLocked || agentBusy}>撤回</button>}
          </div>
        </header>
        <section className={"studio-grid editor-page" + (current.type !== 'ARTICLE' || !assistantOpen ? ' without-conversation' : '')}>
          <div className="editor-content-column">
            <ContentMetadata article={current} title={title} slug={slug} summary={summary} coverUrl={coverUrl} category={category}
              categoryNames={categoryNames} tagNames={tagNames} selectedTags={selectedTags} newCategory={newCategory} newTag={newTag}
              summaryStatus={assistantNotice || automaticSummary.status} manualSummary={automaticSummary.paused}
              onTitle={value => { setTitle(value); setDirty(true) }} onSlug={value => { setSlug(value); setDirty(true) }}
              onSummary={value => { automaticSummary.pause(); setSummary(value); setDirty(true) }} onCover={value => { setCoverUrl(value); setDirty(true) }}
              onCategory={value => { setCategory(value); setDirty(true) }} onTags={value => { setSelectedTags(value); setDirty(true) }}
              onNewCategory={setNewCategory} onNewTag={setNewTag} onAddCategory={() => void addName('category')} onAddTag={() => void addName('tag')} onResumeSummary={automaticSummary.resume} />
          <div className="dashboard-card editor-main">
            <div className="card-head editor-label"><div><p className="eyebrow">WRITING SPACE</p><h2>正文</h2></div><span>{current.type === 'ARTICLE' ? '直接编辑排版后的内容 · 粘贴图片会自动上传' : 'Markdown 文字内容 · 不支持图片'}</span></div>
            <div className="editor-writing-area" ref={previewHost}>
            {current.type === 'ARTICLE' ? <div className="editor-surface">
              <Suspense fallback={<p className="upload-state">正在加载编辑器…</p>}>
                <RichEditor key={current.id} article={current} editorRef={editorRef}
                  agentRef={agentRef} readOnly={agentLocked} onReady={editorReady} onDirty={markDirty} onPending={changePending} onError={setNotice} />
              </Suspense>
            </div> : <textarea className="markdown-editor" aria-label="正文 Markdown" rows={18} value={body} onChange={e => { setBody(e.target.value); setDirty(true) }} placeholder="从这里开始写…" />}
            {pendingUploads > 0 && <p className="upload-state" role="status">正在上传 {pendingUploads} 张图片…</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            </div>
          </div>
          </div>
          {current.type === 'ARTICLE' && assistantOpen && <WritingAssistant key={current.id} adapterRef={agentRef} previewHost={previewHost} title={title} available={availableAssistants} assistantId={availableAssistants.some(v => v.id === selectedAssistantId) ? selectedAssistantId : ''} onAssistantChange={setSelectedAssistantId} onLock={setAgentLocked} onBusy={setAgentBusy} />}
        </section>
    </main> : <ContentDashboard key={view} mode={view === 'drafts' ? 'drafts' : 'published'}
      articles={articles} categories={categoryNames} tags={tagNames} busy={busy} notice={notice}
      onCreate={type => void create(type)} onOpen={id => void open(id)} />}
  </div>
}
