import { usePublicationFlow } from './usePublicationFlow'
import { PublicationDialog } from '../features/articles/components/PublicationDialog'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { logout, SessionBoundary, ChangePassword, type Session } from '../features/auth'
import {
  getArticle,
  createArticle,
  saveArticle,
  unpublishArticle,
  ArticleSidebar,
  ContentDashboard,
  RichEditor,
  type Article,
} from '../features/articles'
import { categories, tags, addCategory } from '../features/taxonomy'
import { SettingsEditor, getSettings, type SiteSettings } from '../features/settings'
import { ProviderSettings } from '../features/ai/ProviderSettings'
import { AgentSettings } from '../features/ai/AgentSettings'
import { WritingAssistant } from '../features/ai/WritingAssistant'
import { assistants as loadAssistants } from '../features/ai/api'
import type { Assistant, EditorAgentAdapter } from '../features/ai/types'
import { errorMessage } from '../shared/lib/errors'
import { EditorTaxonomy } from '../features/articles/components/EditorTaxonomy'
import { documentTitle } from '../features/articles/documentTitle'
import { ApiError } from '../shared/api/client'
import { AnalyticsDashboard } from '../features/analytics/AnalyticsDashboard'
import { ExportContent } from '../features/articles/components/ExportContent'
import { MoveToTrash } from '../features/articles/components/TrashAction'
import { TrashDashboard } from '../features/articles/components/TrashDashboard'
import { ContentHistory } from '../features/articles/components/ContentHistory'

const AgentEditorFixture = lazy(() =>
  import('../features/articles/components/AgentEditorFixture').then((module) => ({
    default: module.AgentEditorFixture,
  })),
)
const typeNames = { ARTICLE: '文章', POST: '帖子' }

export default function App() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('editor-agent-fixture'))
    return (
      <Suspense fallback={<p>加载中</p>}>
        <AgentEditorFixture />
      </Suspense>
    )
  return (
    <SessionBoundary>
      {(session, onSessionEnd, checkSession) => (
        <Studio
          key={session.username}
          session={session}
          onSessionEnd={onSessionEnd}
          checkSession={checkSession}
        />
      )}
    </SessionBoundary>
  )
}

function Studio({
  session,
  onSessionEnd,
  checkSession,
}: {
  session: Session
  onSessionEnd: (notice?: string) => void
  checkSession: () => Promise<boolean>
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)
  const rememberSettings = useCallback((value: SiteSettings) => {
    setSiteSettings(value)
    setAvatarUrl(value.avatarUrl)
    setSiteName(value.siteName)
  }, [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const value = localStorage.getItem('raychi.sidebar.collapsed')
      return value === null ? window.matchMedia('(max-width:680px)').matches : value === 'true'
    } catch {
      return false
    }
  })
  const [current, setCurrent] = useState<Article | null>(null)
  const [view, setView] = useState<
    'content' | 'drafts' | 'settings' | 'ai' | 'password' | 'analytics' | 'trash'
  >('content')
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
  const [editorGeneration, setEditorGeneration] = useState(0)
  const [taxonomyBusy, setTaxonomyBusy] = useState(0)
  const nameWrites = useRef(new Map<string, Promise<string>>())
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [availableAssistants, setAvailableAssistants] = useState<Assistant[]>([])
  const [assistantsLoading, setAssistantsLoading] = useState(false)
  const editorReady = useCallback(() => {
    const markdown = editorRef.current?.getMarkdown()
    if (markdown !== undefined) setTitle((value) => value || documentTitle(markdown))
  }, [])
  const markDirty = useCallback(() => {
    setDirty(true)
    const markdown = editorRef.current?.getMarkdown()
    if (markdown !== undefined) setTitle(documentTitle(markdown))
  }, [])
  const publication = usePublicationFlow({
    current,
    dirty,
    assistantId: selectedAssistantId,
    saveDraft: save,
    resolveTaxonomy: async () => {
      const resolvedCategory =
        current?.type === 'ARTICLE' ? await resolveName('category', category) : null
      const pendingTag = newTag.trim() ? await resolveName('tag', newTag) : ''
      const resolvedTags = [...new Set([...selectedTags, ...(pendingTag ? [pendingTag] : [])])]
      setSelectedTags(resolvedTags)
      setNewTag('')
      return { category: resolvedCategory, tags: resolvedTags }
    },
    onStored: (article) => {
      setDirty(false)
      setCurrent(article)
      setTitle(article.title)
      setSummary(article.summary)
    },
    onPublished: (article) => {
      setCurrent(article)
      setView('content')
      setNotice('已发布，访客现在可以阅读。')
      void refreshTaxonomy()
    },
    onNotice: setNotice,
  })
  const changePending = useCallback((n: number) => {
    transfers.current = Math.max(0, transfers.current + n)
    setPendingUploads(transfers.current)
  }, [])

  useEffect(() => {
    void refreshTaxonomy()
    let active = true
    void getSettings()
      .then((value) => {
        if (active) rememberSettings(value)
      })
      .catch(() => {
        if (active) setAvatarUrl(null)
      })
    return () => {
      active = false
    }
  }, [session?.authenticated, rememberSettings])

  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      try {
        localStorage.setItem('raychi.sidebar.collapsed', String(!value))
      } catch {
        /* Session-only preference when storage is unavailable. */
      }
      return !value
    })
  }

  useEffect(() => {
    if (current?.type !== 'ARTICLE') return
    let active = true
    setAvailableAssistants([])
    setAssistantsLoading(true)
    void loadAssistants()
      .then((items) => {
        if (!active) return
        const enabled = items.filter((item) => item.enabled)
        setAvailableAssistants(enabled)
        setSelectedAssistantId((id) =>
          enabled.some((item) => item.id === id) ? id : (enabled[0]?.id ?? ''),
        )
      })
      .catch((error) => {
        if (active) {
          setSelectedAssistantId('')
          setNotice(errorMessage(error))
        }
      })
      .finally(() => {
        if (active) setAssistantsLoading(false)
      })
    return () => {
      active = false
    }
  }, [current?.id])

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty || pendingUploads > 0 || publication.pending) event.preventDefault()
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty, pendingUploads, publication.pending])

  async function refreshTaxonomy() {
    try {
      const [allCategories, allTags] = await Promise.all([categories(), tags()])
      setCategoryNames(allCategories.map((item) => item.name))
      setTagNames(allTags.map((item) => item.name))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function edit(article: Article) {
    setCurrent(article)
    setTitle(article.title || documentTitle(article.bodyMarkdown))
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
    if (busy || publication.pending || publication.opened || taxonomyBusy > 0) {
      setNotice('请等待当前保存或分类标签操作完成。')
      return false
    }
    if (pendingUploads > 0) {
      setNotice('请等待图片上传完成。')
      return false
    }
    return !dirty || window.confirm('当前修改尚未保存，确定离开吗？')
  }

  async function open(id: string) {
    if (!canLeave()) return
    try {
      edit(await getArticle(id))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  async function create(type: Article['type']) {
    if (!canLeave()) return
    setBusy(true)
    try {
      const created = await createArticle(type)
      edit(created)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function resolveName(kind: 'category' | 'tag', raw: string): Promise<string> {
    const name = raw.trim()
    if (!name) return Promise.resolve(kind === 'category' ? '未分类' : '')
    // New tag names belong to the draft until the server publishes atomically.
    if (kind === 'tag') {
      if (name.length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(name))
        return Promise.reject(new Error('标签不能超过 40 个字符或包含控制字符。'))
      return Promise.resolve(name)
    }
    const existing = categoryNames.find((value) => value === name)
    if (existing) return Promise.resolve(existing)
    const key = 'category:' + name
    const pending = nameWrites.current.get(key)
    if (pending) return pending
    setTaxonomyBusy((value) => value + 1)
    const work = (async () => {
      let actual: string
      try {
        actual = (await addCategory(name)).name
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'NAME_CONFLICT') throw error
        const all = await categories()
        const normalized = (value: string) =>
          value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
        const matched = all.find((item) => normalized(item.name) === normalized(name))
        if (!matched) throw error
        actual = matched.name
      }
      setCategoryNames((values) => [...new Set([...values, actual])].sort())
      return actual
    })().finally(() => {
      nameWrites.current.delete(key)
      setTaxonomyBusy((value) => value - 1)
    })
    nameWrites.current.set(key, work)
    return work
  }

  async function commitName(kind: 'category' | 'tag', value: string) {
    try {
      const actual = await resolveName(kind, value)
      if (kind === 'category') setCategory(actual)
      else {
        setSelectedTags((values) => [...new Set([...values, actual])])
        setNewTag('')
      }
      setDirty(true)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  async function save(): Promise<Article | null> {
    if (!current) return null
    if (pendingUploads > 0) {
      setNotice('请等待图片上传完成。')
      return null
    }
    const markdown =
      current.type === 'ARTICLE' ? (editorRef.current?.getMarkdown() ?? current.bodyMarkdown) : body
    if (current.type !== 'ARTICLE' && /!\[[^\]]*\]\s*\(|<\s*img\b/i.test(markdown)) {
      setNotice('帖子和思考不支持图片，请删除图片引用后再保存。')
      return null
    }
    saving.current = true
    setBusy(true)
    try {
      const resolvedCategory =
        current.type === 'ARTICLE' ? await resolveName('category', category) : null
      const pendingTag = newTag.trim() ? await resolveName('tag', newTag) : ''
      const resolvedTags = [...new Set([...selectedTags, ...(pendingTag ? [pendingTag] : [])])]
      const input = {
        version: current.version,
        title:
          current.type === 'POST'
            ? ''
            : current.type === 'ARTICLE' && dirty
              ? documentTitle(markdown, documentTitle(current.bodyMarkdown) ? '' : current.title)
              : title,
        publicationMetadata: !dirty,
        slug: current.slug,
        summary: current.type === 'POST' ? '' : summary,
        bodyMarkdown: markdown,
        tags: resolvedTags,
        category: resolvedCategory,
        coverUrl: current.type === 'ARTICLE' ? coverUrl || null : null,
      }
      let saved: Article
      try {
        saved = await saveArticle(current.id, input)
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'ARTICLE_VERSION_CONFLICT') throw error
        const fresh = await getArticle(current.id)
        if (
          fresh.updatedAt !== current.updatedAt ||
          fresh.publicUpdatedAt !== current.publicUpdatedAt
        )
          throw error
        // A background summary completed during saving; preserve it and retry only this version change.
        saved = await saveArticle(current.id, {
          ...input,
          version: fresh.version,
          summary: fresh.summary,
        })
      }
      setCurrent(saved)
      setTitle(saved.title)
      setSummary(saved.summary)
      setCategory(saved.category ?? '未分类')
      setSelectedTags(saved.tags)
      setNewTag('')
      setDirty(false)
      setNotice('工作稿已保存，公开内容未改变。')
      return saved
    } catch (error) {
      setNotice(errorMessage(error))
      return null
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function publish() {
    await publication.prepare(true)
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
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!canLeave()) return
    try {
      await logout()
      onSessionEnd()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  async function showSection(section: 'content' | 'drafts' | 'trash') {
    if (!(await checkSession()) || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView(section)
    setNotice('')
  }

  async function showSettings() {
    if (!(await checkSession()) || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('settings')
    setNotice('')
  }

  async function showPassword() {
    if (!(await checkSession()) || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('password')
    setNotice('')
  }

  async function showAssistants() {
    if (!(await checkSession()) || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('ai')
    setNotice('')
  }

  async function showAnalytics() {
    if (!(await checkSession()) || !canLeave()) return
    setCurrent(null)
    setDirty(false)
    setView('analytics')
    setNotice('')
  }

  return (
    <div className={'shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      {!sidebarCollapsed && (
        <button className="sidebar-backdrop" aria-label="收起侧边栏遮罩" onClick={toggleSidebar} />
      )}
      <ArticleSidebar
        active={view}
        username={session.username ?? '你'}
        siteName={siteName}
        avatarUrl={avatarUrl}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onContent={() => showSection('content')}
        onDrafts={() => showSection('drafts')}
        onTrash={() => showSection('trash')}
        onAI={() => void showAssistants()}
        onAnalytics={() => void showAnalytics()}
        onSettings={() => void showSettings()}
        onChangePassword={() => void showPassword()}
        onSignOut={() => void signOut()}
      />
      {view === 'trash' ? (
        <TrashDashboard
          busy={busy}
          notice={notice}
          onBusy={setBusy}
          onNotice={setNotice}
          onRecovered={(article) => {
            edit(article)
            setEditorGeneration((value) => value + 1)
            setNotice('已恢复为草稿，手动发布后才会公开。')
          }}
        />
      ) : view === 'analytics' ? (
        <AnalyticsDashboard />
      ) : view === 'password' ? (
        <ChangePassword
          onComplete={() => onSessionEnd('密码已修改，请使用新密码重新登录。')}
          onCancel={() => void showSection('content')}
        />
      ) : view === 'ai' ? (
        <AgentSettings />
      ) : view === 'settings' ? (
        <SettingsEditor
          providers={<ProviderSettings />}
          initialValue={siteSettings}
          onLoaded={rememberSettings}
          onSaved={rememberSettings}
        />
      ) : current ? (
        <main className="workspace studio-page editor-workspace">
          <header className="studio-head editor-head">
            <div>
              <div className="editor-navigation">
                <button
                  className="back-link"
                  onClick={() => showSection(view === 'drafts' ? 'drafts' : 'content')}
                >
                  ← 返回{view === 'drafts' ? '草稿箱' : '内容管理'}
                </button>
                <p className="eyebrow">
                  {current.status === 'PUBLISHED' ? '已发布' : '草稿'} · {typeNames[current.type]}
                  {dirty ? ' · 尚未保存' : ''}
                </p>
              </div>
              <h1 title={title}>{current.type === 'ARTICLE' ? title || '写文章' : '写帖子'}</h1>
            </div>
            <div className="actions">
              <MoveToTrash
                article={current}
                disabled={
                  dirty ||
                  busy ||
                  publication.opened ||
                  publication.pending ||
                  taxonomyBusy > 0 ||
                  pendingUploads > 0 ||
                  agentLocked ||
                  agentBusy
                }
                onBusy={setBusy}
                onMoved={() => {
                  setCurrent(null)
                  setDirty(false)
                  setView('trash')
                  setNotice('已移到回收站，访客无法阅读。')
                }}
              />
              <ContentHistory
                article={current}
                dirty={dirty}
                disabled={
                  busy ||
                  publication.pending ||
                  taxonomyBusy > 0 ||
                  pendingUploads > 0 ||
                  agentLocked ||
                  agentBusy
                }
                onRestored={(article) => {
                  edit(article)
                  setEditorGeneration((value) => value + 1)
                }}
                onBusy={setBusy}
                onNotice={setNotice}
              />
              <ExportContent
                id={current.id}
                version={current.version}
                dirty={dirty}
                disabled={
                  busy ||
                  publication.pending ||
                  taxonomyBusy > 0 ||
                  pendingUploads > 0 ||
                  agentLocked ||
                  agentBusy
                }
                onNotice={setNotice}
              />
              {current.type === 'ARTICLE' && (
                <button
                  aria-expanded={assistantOpen}
                  aria-controls="writing-conversation"
                  disabled={agentBusy || agentLocked}
                  onClick={() => setAssistantOpen((v) => !v)}
                >
                  {assistantOpen ? '收起助手' : '写作助手'}
                </button>
              )}
              <button
                onClick={() =>
                  void (current.type === 'ARTICLE' ? publication.prepare(false) : save())
                }
                disabled={
                  busy ||
                  (current.type === 'ARTICLE' && assistantsLoading) ||
                  publication.pending ||
                  taxonomyBusy > 0 ||
                  pendingUploads > 0 ||
                  agentLocked ||
                  agentBusy
                }
              >
                保存
              </button>
              <button
                className="primary"
                onClick={() => void publish()}
                disabled={
                  busy ||
                  (current.type === 'ARTICLE' && assistantsLoading) ||
                  publication.pending ||
                  taxonomyBusy > 0 ||
                  pendingUploads > 0 ||
                  agentLocked ||
                  agentBusy
                }
              >
                {current.status === 'PUBLISHED' ? '发布更新' : '发布'}
              </button>
              {current.status === 'PUBLISHED' && (
                <button
                  onClick={() => void unpublish()}
                  disabled={busy || publication.pending || agentLocked || agentBusy}
                >
                  撤回
                </button>
              )}
            </div>
          </header>
          {publication.opened && (
            <PublicationDialog
              fields={publication.fields}
              phase={publication.phase}
              error={publication.error}
              pending={publication.pending}
              addressLocked={!!current.publishedAt}
              onChange={publication.setFields}
              onClose={publication.close}
              onRetry={() => void publication.prepare(true)}
              onSubmit={() => void publication.submit()}
              article={current.type === 'ARTICLE'}
              taxonomyBusy={taxonomyBusy > 0}
            >
              <EditorTaxonomy
                article={current.type === 'ARTICLE'}
                category={category}
                categoryNames={categoryNames}
                tags={selectedTags}
                tagNames={tagNames}
                tagInput={newTag}
                busy={busy || publication.pending || taxonomyBusy > 0 || agentLocked}
                onCategory={(value) => {
                  setCategory(value)
                  setDirty(true)
                }}
                onCategoryCommit={(value) => commitName('category', value)}
                onTagInput={(value) => {
                  setNewTag(value)
                  setDirty(true)
                }}
                onTagCommit={(value) => commitName('tag', value)}
                onRemoveTag={(value) => {
                  setSelectedTags((values) => values.filter((tag) => tag !== value))
                  setDirty(true)
                }}
              />
            </PublicationDialog>
          )}
          <section
            className={
              'studio-grid editor-page' +
              (current.type !== 'ARTICLE'
                ? ' without-conversation'
                : !assistantOpen
                  ? ' conversation-collapsed'
                  : '')
            }
          >
            <div className="editor-content-column">
              <div className="dashboard-card editor-main">
                <div className="card-head editor-label">
                  <div>
                    <h2>正文</h2>
                    <p className="eyebrow">WRITING SPACE</p>
                  </div>
                  <span>
                    {current.type === 'ARTICLE'
                      ? '直接编辑排版后的内容 · 粘贴图片会自动上传'
                      : 'Markdown 文字内容 · 不支持图片'}
                  </span>
                </div>
                <div className="editor-writing-area" ref={previewHost}>
                  {current.type === 'ARTICLE' ? (
                    <div className="editor-surface">
                      <Suspense fallback={<p className="upload-state">正在加载编辑器…</p>}>
                        <RichEditor
                          key={`${current.id}:${editorGeneration}`}
                          article={current}
                          editorRef={editorRef}
                          agentRef={agentRef}
                          readOnly={agentLocked || busy || publication.pending}
                          onReady={editorReady}
                          onDirty={markDirty}
                          onPending={changePending}
                          onError={setNotice}
                        />
                      </Suspense>
                    </div>
                  ) : (
                    <textarea
                      className="markdown-editor"
                      aria-label="正文 Markdown"
                      rows={18}
                      value={body}
                      onChange={(e) => {
                        setBody(e.target.value)
                        setDirty(true)
                      }}
                      placeholder="从这里开始写…"
                    />
                  )}
                  {pendingUploads > 0 && (
                    <p className="upload-state" role="status">
                      正在上传 {pendingUploads} 张图片…
                    </p>
                  )}
                  {notice && (
                    <p className="notice" role="status">
                      {notice}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {current.type === 'ARTICLE' && (
              <div
                id="writing-conversation"
                className="conversation-panel"
                inert={!assistantOpen || busy || publication.pending}
                aria-hidden={!assistantOpen}
              >
                <WritingAssistant
                  username={session.username ?? '你'}
                  userAvatar={avatarUrl}
                  key={current.id}
                  adapterRef={agentRef}
                  previewHost={previewHost}
                  title={title}
                  available={availableAssistants}
                  assistantId={
                    availableAssistants.some((v) => v.id === selectedAssistantId)
                      ? selectedAssistantId
                      : ''
                  }
                  onAssistantChange={setSelectedAssistantId}
                  onLock={setAgentLocked}
                  onBusy={setAgentBusy}
                />
              </div>
            )}
          </section>
        </main>
      ) : (
        <ContentDashboard
          key={view}
          mode={view === 'drafts' ? 'drafts' : 'published'}
          categories={categoryNames}
          tags={tagNames}
          busy={busy}
          notice={notice}
          onCreate={(type) => void create(type)}
          onOpen={(id) => void open(id)}
        />
      )}
    </div>
  )
}
