import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { getSession, login, logout } from '../features/auth/api'
import type { Session } from '../features/auth/types'
import type { Article } from '../features/articles/types'
import { listArticles, getArticle, createArticle, saveArticle, publishArticle, unpublishArticle } from '../features/articles/api'
import { ArticleSidebar } from '../features/articles/components/ArticleSidebar'
import { ContentDashboard } from '../features/articles/components/ContentDashboard'
import { LoginScreen } from '../features/auth/LoginScreen'
import { categories, tags, addCategory, addTag } from '../features/taxonomy/api'
import { SettingsEditor } from '../features/settings/SettingsEditor'
import { errorMessage } from '../shared/errors'
import { Select } from '../shared/components/Select'

const RichEditor = lazy(() => import('../features/articles/components/RichEditor').then(module => ({ default: module.RichEditor })))
const typeNames = { ARTICLE: '文章', POST: '帖子' }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [current, setCurrent] = useState<Article | null>(null)
  const [view, setView] = useState<'content' | 'drafts' | 'settings'>('content')
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
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const editorRef = useRef<MDXEditorMethods>(null)
  const markDirty = useCallback(() => setDirty(true), [])
  const changePending = useCallback((n: number) => setPendingUploads(v => Math.max(0, v + n)), [])

  useEffect(() => {
    getSession().then(setSession).catch(error => setNotice(errorMessage(error)))
  }, [])

  useEffect(() => {
    if (!session?.authenticated) return
    void refresh()
    void refreshTaxonomy()
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
    finally { setBusy(false) }
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
    try { await logout(); setSession({ authenticated: false, username: null }); setCurrent(null) }
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

  return <div className="shell">
    <ArticleSidebar active={view} username={session.username}
      onContent={() => showSection('content')} onDrafts={() => showSection('drafts')}
      onSettings={showSettings} onSignOut={() => void signOut()} />
    {view === 'settings' ? <SettingsEditor onBack={() => showSection('content')} /> : current ? <main className="workspace studio-page editor-workspace">
        <header className="studio-head editor-head">
          <div><button className="back-link" onClick={() => showSection(view)}>← 返回{view === 'drafts' ? '草稿箱' : '内容管理'}</button><p className="eyebrow">{current.status === 'PUBLISHED' ? '已发布' : '私人草稿'} · {typeNames[current.type]}{dirty ? ' · 尚未保存' : ''}</p>
            <h1>写{current.type === 'ARTICLE' ? '文章' : '帖子'}</h1></div>
          <div className="actions">
            <button onClick={() => void save()} disabled={busy || pendingUploads > 0}>保存</button>
            <button className="primary" onClick={() => void publish()} disabled={busy || pendingUploads > 0}>{current.status === 'PUBLISHED' ? '发布更新' : '发布'}</button>
            {current.status === 'PUBLISHED' && <button onClick={() => void unpublish()} disabled={busy}>撤回</button>}
          </div>
        </header>
        <section className="studio-grid editor-page">
          <div className="dashboard-card editor-main">
            <div className="card-head editor-label"><div><p className="eyebrow">WRITING SPACE</p><h2>正文</h2></div><span>{current.type === 'ARTICLE' ? '直接编辑排版后的内容 · 粘贴图片会自动上传' : 'Markdown 文字内容 · 不支持图片'}</span></div>
            <div className="editor-writing-area">
            {current.type === 'ARTICLE' ? <div className="editor-surface">
              <Suspense fallback={<p className="upload-state">正在加载编辑器…</p>}>
                <RichEditor key={current.id} article={current} editorRef={editorRef}
                  onDirty={markDirty} onPending={changePending} onError={setNotice} />
              </Suspense>
            </div> : <textarea className="markdown-editor" aria-label="正文 Markdown" rows={18} value={body} onChange={e => { setBody(e.target.value); setDirty(true) }} placeholder="从这里开始写…" />}
            {pendingUploads > 0 && <p className="upload-state" role="status">正在上传 {pendingUploads} 张图片…</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            </div>
          </div>
          <aside className="dashboard-card metadata-panel" aria-label="内容信息">
            <p className="eyebrow">DETAILS</p><h2>内容信息</h2>
            <div className="fields">
              <label>标题{current.type !== 'ARTICLE' && '（可选）'}<input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }} placeholder={current.type === 'ARTICLE' ? '给文章一个标题' : '可以留空'} /></label>
              {current.type === 'ARTICLE' && <><label>地址别名<input value={slug} onChange={e => { setSlug(e.target.value); setDirty(true) }} disabled={!!current.publishedAt} placeholder="例如 my-first-article" /></label>
                <label>摘要<textarea value={summary} onChange={e => { setSummary(e.target.value); setDirty(true) }} rows={3} placeholder="简要介绍这篇内容" /></label>
                <label>封面地址（可选）<input value={coverUrl} onChange={e => { setCoverUrl(e.target.value); setDirty(true) }} placeholder="图片地址" /></label></>}
              {current.type !== 'POST' && <Select label="分类" value={category}
                onChange={value => { setCategory(value); setDirty(true) }}
                options={[...new Set(['未分类', ...categoryNames])].map(name => ({ value: name, label: name }))}
                hint="未选择时使用“未分类”" />}
            </div>
            {current.type !== 'POST' && <div className="taxonomy-add"><input aria-label="新分类名称" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="新分类名称" /><button onClick={() => void addName('category')}>添加</button></div>}
            <div className="taxonomy-options"><strong>标签</strong>{tagNames.map(name => <label key={name}><input type="checkbox" checked={selectedTags.includes(name)} onChange={e => { setSelectedTags(e.target.checked ? [...selectedTags, name] : selectedTags.filter(tag => tag !== name)); setDirty(true) }} />{name}</label>)}
              <div className="taxonomy-add"><input aria-label="新标签名称" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="新标签名称" /><button onClick={() => void addName('tag')}>添加</button></div></div>
            <div className="metadata-note">保存会更新工作稿；发布后访客才能看到最新内容。</div>
          </aside>
        </section>
    </main> : <ContentDashboard key={view} mode={view === 'drafts' ? 'drafts' : 'published'}
      articles={articles} categories={categoryNames} tags={tagNames} busy={busy} notice={notice}
      onCreate={type => void create(type)} onOpen={id => void open(id)} />}
  </div>
}
