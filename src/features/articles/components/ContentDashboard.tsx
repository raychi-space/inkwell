import { useAdminContents } from '../useAdminContents'
import { useState } from 'react'
import { Select } from '../../../shared/ui/Select'
import { Card, CardHead } from '../../../shared/ui/Card'
import { EmptyState } from '../../../shared/ui/EmptyState'
import type { Article } from '../types'

type Props = {
  mode: 'published' | 'drafts'
  categories: string[]
  tags: string[]
  busy: boolean
  notice: string
  onCreate: (type: Article['type']) => void
  onOpen: (id: string) => void
}

const typeNames: Record<Article['type'], string> = { ARTICLE: '文章', POST: '帖子' }

function wordCount(markdown: string) {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`~>|]/g, ' ')
  return (text.match(/[\p{Script=Han}]|[\p{Script=Latin}\p{N}]+/gu) ?? []).length
}

export function ContentDashboard({
  mode,
  categories,
  tags,
  busy,
  notice,
  onCreate,
  onOpen,
}: Props) {
  const [sort, setSort] = useState('recent')
  const [type, setType] = useState('all')
  const [category, setCategory] = useState('all')
  const [tag, setTag] = useState('all')

  const [page, setPage] = useState(1)
  const { result, loading, error } = useAdminContents(page, {
    status: mode === 'published' ? 'PUBLISHED' : 'DRAFT',
    type: type === 'all' ? undefined : type,
    category: category === 'all' ? undefined : category,
    tag: tag === 'all' ? undefined : tag,
    sort,
  })
  const scopedArticles = result?.items ?? []
  const visible = scopedArticles
  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setPage(1)
  }
  const words = scopedArticles.reduce((sum, article) => sum + wordCount(article.bodyMarkdown), 0)
  const counts = {
    ARTICLE: scopedArticles.filter((article) => article.type === 'ARTICLE').length,
    POST: scopedArticles.filter((article) => article.type === 'POST').length,
  }

  return (
    <main className="workspace studio-page dashboard-page">
      <header className="studio-head dashboard-head">
        <div>
          <p className="eyebrow">CONTENT STUDIO</p>
          <h1>{mode === 'published' ? '内容管理' : '草稿箱'}</h1>
          <p>
            {mode === 'published'
              ? '查看与管理已经发布的内容。'
              : '未发布的内容都在这里，整理好后再发布。'}
          </p>
        </div>
        <div className="create-actions" aria-label="新建内容">
          <button disabled={busy} onClick={() => onCreate('POST')}>
            ＋ 写帖子
          </button>
          <button className="primary" disabled={busy} onClick={() => onCreate('ARTICLE')}>
            ＋ 写文章
          </button>
        </div>
      </header>
      {(notice || error) && (
        <p className="notice dashboard-notice" role="status">
          {notice || error}
        </p>
      )}
      <div className="studio-grid dashboard-grid">
        <Card className="recent-card" aria-labelledby="recent-title">
          <CardHead
            eyebrow="YOUR WRITING"
            title={
              <span id="recent-title">{mode === 'published' ? '最近的内容' : '最近的草稿'}</span>
            }
            aside={<span>{result?.total ?? 0} 篇</span>}
          />
          <div className="content-filters">
            <Select
              label="排序"
              value={sort}
              onChange={changeFilter(setSort)}
              options={[
                { value: 'recent', label: '最近更新' },
                { value: 'oldest', label: '最早更新' },
                { value: 'type', label: '按类型' },
                { value: 'category', label: '按分类' },
                { value: 'tag', label: '按标签' },
              ]}
            />
            <Select
              label="类型"
              value={type}
              onChange={changeFilter(setType)}
              options={[
                { value: 'all', label: '全部类型' },
                { value: 'POST', label: '帖子' },
                { value: 'ARTICLE', label: '文章' },
              ]}
            />
            <Select
              label="分类"
              value={category}
              onChange={changeFilter(setCategory)}
              options={[
                { value: 'all', label: '全部分类' },
                ...categories.map((name) => ({ value: name, label: name })),
              ]}
            />
            <Select
              label="标签"
              value={tag}
              onChange={changeFilter(setTag)}
              options={[
                { value: 'all', label: '全部标签' },
                ...tags.map((name) => ({ value: name, label: name })),
              ]}
            />
          </div>
          <div
            className="content-list"
            tabIndex={0}
            aria-label={mode === 'published' ? '已发布内容列表' : '草稿列表'}
          >
            {loading ? (
              <p role="status">正在加载内容…</p>
            ) : visible.length ? (
              visible.map((article) => (
                <button className="content-row" key={article.id} onClick={() => onOpen(article.id)}>
                  <span className="content-row-main">
                    <span className="content-title">
                      {article.title ||
                        article.bodyMarkdown
                          .replace(/[#*_`~>]/g, '')
                          .trim()
                          .slice(0, 42) ||
                        `未命名${typeNames[article.type]}`}
                    </span>
                    <span className="content-meta">
                      <span>{typeNames[article.type]}</span>
                      {article.type === 'ARTICLE' && (
                        <>
                          <span>·</span>
                          <span>{article.category ?? '未分类'}</span>
                        </>
                      )}
                      {article.tags.length > 0 && <span>· {article.tags.join('、')}</span>}
                    </span>
                  </span>
                  <span className="content-row-side">
                    <span
                      className={`status-pill ${article.status === 'PUBLISHED' ? 'published' : ''}`}
                    >
                      {article.status === 'PUBLISHED' ? '已发布' : '草稿'}
                    </span>
                    <time dateTime={article.updatedAt}>
                      {new Date(article.updatedAt).toLocaleDateString('zh-CN')}
                    </time>
                  </span>
                </button>
              ))
            ) : (
              <EmptyState
                title={
                  scopedArticles.length
                    ? '没有符合筛选条件的内容'
                    : mode === 'published'
                      ? '还没有已发布内容'
                      : '还没有草稿'
                }
                hint={
                  scopedArticles.length
                    ? '试试调整筛选条件。'
                    : '从上方选择一种类型，开始第一篇创作。'
                }
              />
            )}
          </div>
          <nav aria-label="管理内容分页" className="actions">
            <button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>
              上一页
            </button>
            <span>第 {page} 页</span>
            <button
              disabled={loading || !result || page * result.pageSize >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </nav>
        </Card>
        <Card className="stats-card" aria-labelledby="stats-title">
          <CardHead eyebrow="OVERVIEW" title={<span id="stats-title">统计数据</span>} />
          <div className="stat-feature">
            <strong>{words.toLocaleString('zh-CN')}</strong>
            <span>本页正文总字数</span>
          </div>
          <dl className="stats-list">
            <div>
              <dt>{mode === 'published' ? '本页已发布内容' : '本页草稿数'}</dt>
              <dd>{scopedArticles.length}</dd>
            </div>
            <div>
              <dt>本页文章</dt>
              <dd>{counts.ARTICLE}</dd>
            </div>
            <div>
              <dt>本页帖子</dt>
              <dd>{counts.POST}</dd>
            </div>
          </dl>
          <p className="stats-note">
            {mode === 'published'
              ? '阅读量待接入统计接口'
              : '草稿仅自己可见，发布后才会展示在网站上。'}
          </p>
        </Card>
      </div>
    </main>
  )
}
