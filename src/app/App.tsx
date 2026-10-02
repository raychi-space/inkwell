import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { logout, SessionBoundary, type Session } from '../features/auth'
import { listArticles, getArticle, createArticle, saveArticle, publishArticle, unpublishArticle, ArticleSidebar, ContentDashboard, RichEditor, type Article } from '../features/articles'
import { categories, tags, addCategory, addTag } from '../features/taxonomy'
import { SettingsEditor, getSettings, type SiteSettings } from '../features/settings'
import { AgentSettings } from '../features/ai/AgentSettings'
import { WritingAssistant } from '../features/ai/WritingAssistant'
import { assistants as loadAssistants } from '../features/ai/api'
import type { Assistant, EditorAgentAdapter } from '../features/ai/types'
import { errorMessage } from '../shared/lib/errors'
import { ContentMetadata } from '../features/articles/components/ContentMetadata'
import { EditorTaxonomy } from '../features/articles/components/EditorTaxonomy'
import { documentTitle } from '../features/articles/documentTitle'
import { ApiError } from '../shared/api/client'

const AgentEditorFixture = lazy(() => import('../features/articles/components/AgentEditorFixture').then(module => ({ default: module.AgentEditorFixture })))
const typeNames = { ARTICLE: '文章', POST: '帖子' }

export default function App() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('editor-agent-fixture')) return <Suspense fallback={<p>加载中</p>}><AgentEditorFixture /></Suspense>
  return <SessionBoundary>{(session, onSessionEnd, checkSession) => <Studio key={session.username} session={session} onSessionEnd={onSessionEnd} checkSession={checkSession} />}</SessionBoundary>
}

function Studio({ session, onSessionEnd, checkSession }: { session: Session; onSessionEnd: () => void; checkSession: () => Promise<boolean> }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)
  const rememberSettings = useCallback((value: SiteSettings) => {
    setSiteSettings(value); setAvatarUrl(value.avatarUrl); setSiteName(value.siteName)
  }, [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { const value = localStorage.getItem('raychi.sidebar.collapsed'); return value === null ? window.matchMedia('(max-width:680px)').matches : value === 'true' } catch { return false }
  })
  const [articles, setArticles] = useState<Article[]>([])
  const [current, setCurrent] = useState<Article | null>(null)
  const [view, setView] = useState<'content' | 'drafts' | 'settings' | 'ai'>('content')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [category, setCategory] = useState('未分类')
  const [categoryNames, setCategoryNames] = useState<string[]>([])
  const [tagNames, setTagNames] = useState<string[]>([])
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
  const [taxonomyBusy, setTaxonomyBusy] = useState(0)
  const nameWrites = useRef(new Map<string, Promise<string>>())
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([])
  const [assistantNotice, setAssistantNotice] = useState('')
  const editorReady = useCallback(() => {
    const markdown = editorRef.current?.getMarkdown()
    if (markdown !== undefined) setTitle(value => documentTitle(markdown, value))
  }, [])
  const markDirty = useCallback(() => {
    setDirty(true)
    const markdown = editorRef.current?.getMarkdown()
    if (markdown !== undefined) setTitle(documentTitle(markdown))
  }, [])
  const currentRef = useRef(current)
  currentRef.current = current
  // Poll persisted publication work only; typing, pausing and draft saving never create model tasks.
  useEffect(() => {
    if (!current || !['PENDING', 'RUNNING'].includes(current.summaryStatus ?? '') || busy) return
    let active = true
    let timer = 0
    const id = current.id
    async function poll() {
      try {
        const fresh = await getArticle(id)
        const before = currentRef.current
        if (!active || saving.current || before?.id !== id) return
        // Only the server's summary update may advance the local version silently.
        if (fresh.updatedAt !== before.updatedAt || fresh.publicUpdatedAt !== before.publicUpdatedAt) {
          setNotice('内容已在其他位置更新，请重新打开后继续编辑。'); return
        }
        setCurrent(fresh)
        setSummary(fresh.summary)
        if (['PENDING', 'RUNNING'].includes(fresh.summaryStatus ?? '')) timer = window.setTimeout(() => void poll(), 1500)
      } catch { if (active) timer = window.setTimeout(() => void poll(), 3000) }
    }
    timer = window.setTimeout(() => void poll(), 1000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [current?.id, current?.summaryStatus, busy])
  const summaryStatus = assistantNotice || ({
    NONE: '发布后自动生成摘要', PENDING: '已发布，摘要等待生成', RUNNING: '正在生成已发布内容的摘要…',
    SUCCEEDED: '摘要已自动生成并保存', FAILED: '摘要生成失败，原摘要已保留；再次发布可重试',
    SKIPPED: '配置并启用助手后，发布时自动生成摘要', CANCELLED: '已撤回，摘要任务已取消',
  }[current?.summaryStatus ?? 'NONE'])
  const changePending = useCallback((n: number) => { transfers.current = Math.max(0, transfers.current + n); setPendingUploads(transfers.current) }, [])

  useEffect(() => {
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
    setTitle(documentTitle(article.bodyMarkdown, article.title))
    setSummary(article.summary)
    setBody(article.bodyMarkdown)
    setSelectedTags(article.tags)
    setCategory(article.category ?? '未分类')
    setCoverUrl(article.coverUrl ?? '')
    setNewTag('')
    setDirty(false)
    setNotice('')
    setView(article.status === 'PUBLISHED' ? 'content' : 'drafts')
  }

  function canLeave() {
    if (busy || taxonomyBusy > 0) { setNotice('请等待当前保存或分类标签操作完成。'); return false }
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

  function resolveName(kind: 'category' | 'tag', raw: string): Promise<string> {
    const name = raw.trim()
    if (!name) return Promise.resolve(kind === 'category' ? '未分类' : '')
    const names = kind === 'category' ? categoryNames : tagNames
    const existing = names.find(value => value === name)
    if (existing) return Promise.resolve(existing)
    const key = kind + ':' + name
    const pending = nameWrites.current.get(key)
    if (pending) return pending
    setTaxonomyBusy(value => value + 1)
    const work = (async () => {
      let actual: string
      try { actual = (await (kind === 'category' ? addCategory(name) : addTag(name))).name }
      catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'NAME_CONFLICT') throw error
        const all = await (kind === 'category' ? categories() : tags())
        const normalized = (value: string) => kind === 'category' ? value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase() : value
        const matched = all.find(item => normalized(item.name) === normalized(name))
        if (!matched) throw error
        actual = matched.name
      }
      if (kind === 'category') setCategoryNames(values => [...new Set([...values, actual])].sort())
      else setTagNames(values => [...new Set([...values, actual])].sort())
      return actual
    })().finally(() => { nameWrites.current.delete(key); setTaxonomyBusy(value => value - 1) })
    nameWrites.current.set(key, work)
    return work
  }

  async function commitName(kind: 'category' | 'tag', value: string) {
    try {
      const actual = await resolveName(kind, value)
      if (kind === 'category') setCategory(actual)
      else { setSelectedTags(values => [...new Set([...values, actual])]); setNewTag('') }
      setDirty(true)
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
      const resolvedCategory = current.type === 'ARTICLE' ? await resolveName('category', category) : null
      const pendingTag = newTag.trim() ? await resolveName('tag', newTag) : ''
      const resolvedTags = [...new Set([...selectedTags, ...(pendingTag ? [pendingTag] : [])])]
      const input = {
        version: current.version, title: current.type === 'ARTICLE' ? documentTitle(markdown, documentTitle(current.bodyMarkdown) ? '' : current.title) : title, slug: current.slug,
        summary, bodyMarkdown: markdown,
        tags: resolvedTags,
        category: resolvedCategory,
        coverUrl: current.type === 'ARTICLE' ? coverUrl || null : null,
      }
      let saved: Article
      try { saved = await saveArticle(current.id, input) }
      catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'ARTICLE_VERSION_CONFLICT') throw error
        const fresh = await getArticle(current.id)
        if (fresh.updatedAt !== current.updatedAt || fresh.publicUpdatedAt !== current.publicUpdatedAt) throw error
        // A background summary completed during saving; preserve it and retry only this version change.
        saved = await saveArticle(current.id, { ...input, version: fresh.version, summary: fresh.summary })
      }
      setCurrent(saved)
      setTitle(saved.title)
      setSummary(saved.summary)
      setCategory(saved.category ?? '未分类')
      setSelectedTags(saved.tags)
      setNewTag('')
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
      const published = await publishArticle(saved.id, saved.version, current?.type === 'ARTICLE' ? selectedAssistantId : undefined)
      setCurrent(published)
      setView('content')
      setNotice(current?.type === 'ARTICLE' ? '文章已发布，摘要将在后台自动生成。' : '帖子已发布，访客现在可以阅读。')
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

  async function signOut() {
    if (!canLeave()) return
    try { await logout(); onSessionEnd() }
    catch (error) { setNotice(errorMessage(error)) }
  }

  async function showSection(section: 'content' | 'drafts') {
    if (!await checkSession() || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView(section)
    setNotice('')
  }

  async function showSettings() {
    if (!await checkSession() || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('settings')
    setNotice('')
  }

  async function showAssistants() {
    if (!await checkSession() || !canLeave()) return
    setCurrent(null); setDirty(false); setView('ai'); setNotice('')
  }

  return <div className={'shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {!sidebarCollapsed && <button className="sidebar-backdrop" aria-label="收起侧边栏遮罩" onClick={toggleSidebar} />}
    <ArticleSidebar active={view} username={session.username} siteName={siteName} avatarUrl={avatarUrl} collapsed={sidebarCollapsed} onToggle={toggleSidebar}
      onContent={() => showSection('content')} onDrafts={() => showSection('drafts')}
      onAI={() => void showAssistants()} onSettings={() => void showSettings()} onSignOut={() => void signOut()} />
    {view === 'ai' ? <AgentSettings /> : view === 'settings' ? <SettingsEditor initialValue={siteSettings} onLoaded={rememberSettings} onSaved={rememberSettings} /> : current ? <main className="workspace studio-page editor-workspace">
        <header className="studio-head editor-head">
          <div><button className="back-link" onClick={() => showSection(view === 'drafts' ? 'drafts' : 'content')}>← 返回{view === 'drafts' ? '草稿箱' : '内容管理'}</button><p className="eyebrow">{current.status === 'PUBLISHED' ? '已发布' : '私人草稿'} · {typeNames[current.type]}{dirty ? ' · 尚未保存' : ''}</p>
            <h1 title={title}>{current.type === 'ARTICLE' ? title || '写文章' : '写帖子'}</h1></div>
          <div className="actions">
            {current.type === 'ARTICLE' && <button aria-expanded={assistantOpen} aria-controls="writing-conversation" disabled={agentBusy || agentLocked} onClick={() => setAssistantOpen(v => !v)}>{assistantOpen ? '收起助手' : '写作助手'}</button>}
            <button onClick={() => void save()} disabled={busy || taxonomyBusy > 0 || pendingUploads > 0 || agentLocked || agentBusy}>保存</button>
            <button className="primary" onClick={() => void publish()} disabled={busy || taxonomyBusy > 0 || pendingUploads > 0 || agentLocked || agentBusy}>{current.status === 'PUBLISHED' ? '发布更新' : '发布'}</button>
            {current.status === 'PUBLISHED' && <button onClick={() => void unpublish()} disabled={busy || agentLocked || agentBusy}>撤回</button>}
          </div>
        </header>
        <section className={"studio-grid editor-page" + (current.type !== 'ARTICLE' ? ' without-conversation' : !assistantOpen ? ' conversation-collapsed' : '')}>
          <div className="editor-content-column">
            <ContentMetadata article={current} summary={summary} summaryStatus={summaryStatus} />
          <div className="dashboard-card editor-main">
            <div className="card-head editor-label"><div><p className="eyebrow">WRITING SPACE</p><h2>正文</h2></div><span>{current.type === 'ARTICLE' ? '直接编辑排版后的内容 · 粘贴图片会自动上传' : 'Markdown 文字内容 · 不支持图片'}</span></div>
            <EditorTaxonomy article={current.type === 'ARTICLE'} category={category} categoryNames={categoryNames} tags={selectedTags}
              tagNames={tagNames} tagInput={newTag} busy={busy || taxonomyBusy > 0 || agentLocked}
              onCategory={value => { setCategory(value); setDirty(true) }} onCategoryCommit={value => commitName('category', value)}
              onTagInput={value => { setNewTag(value); setDirty(true) }} onTagCommit={value => commitName('tag', value)}
              onRemoveTag={value => { setSelectedTags(values => values.filter(tag => tag !== value)); setDirty(true) }} />
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
          {current.type === 'ARTICLE' && <div id="writing-conversation" className="conversation-panel" inert={!assistantOpen} aria-hidden={!assistantOpen}>
            <WritingAssistant key={current.id} adapterRef={agentRef} previewHost={previewHost} title={title} available={availableAssistants} assistantId={availableAssistants.some(v => v.id === selectedAssistantId) ? selectedAssistantId : ''} onAssistantChange={setSelectedAssistantId} onLock={setAgentLocked} onBusy={setAgentBusy} />
          </div>}
        </section>
    </main> : <ContentDashboard key={view} mode={view === 'drafts' ? 'drafts' : 'published'}
      articles={articles} categories={categoryNames} tags={tagNames} busy={busy} notice={notice}
      onCreate={type => void create(type)} onOpen={id => void open(id)} />}
  </div>
}
