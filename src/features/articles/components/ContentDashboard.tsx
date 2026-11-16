import { Button } from '../../../shared/ui/Button'
import type { ReactNode } from 'react'
import { useSessionState } from '../../../shared/lib/useSessionState'
import { useAdminContents } from '../useAdminContents'
import { Select } from '../../../shared/ui/Select'
import { Card, CardHead } from '../../../shared/ui/Card'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import type { Article } from '../types'

type Props = {
  navigation: ReactNode
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
  navigation,
  categories,
  tags,
  busy,
  notice,
  onCreate,
  onOpen,
}: Props) {
  const mode = 'content'
  const [status, setStatus] = useSessionState('content.status', 'all')
  const [sort, setSort] = useSessionState(mode + '.sort', 'recent')
  const [type, setType] = useSessionState(mode + '.type', 'all')
  const [category, setCategory] = useSessionState(mode + '.category', 'all')
  const [tag, setTag] = useSessionState(mode + '.tag', 'all')

  const [page, setPage] = useSessionState(mode + '.page', 1)
  const { result, loading, error, refresh } = useAdminContents(page, {
    status: status === 'all' ? undefined : status,
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
      <PageHeader
        kicker="CONTENT STUDIO"
        title="内容管理"
        actionsLabel="新建内容"
        actions={
          <>
            <Button variant="secondary" disabled={loading || busy} onClick={refresh}>
              刷新
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onCreate('POST')}>
              ＋ 写帖子
            </Button>
            <Button
              variant="primary"
              className="primary"
              disabled={busy}
              onClick={() => onCreate('ARTICLE')}
            >
              ＋ 写文章
            </Button>
          </>
        }
      />
      {navigation}
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
              <span className="recent-title-group">
                <span id="recent-title">最近的内容</span>
                <span className="content-loading-slot">
                  {loading && (
                    <span
                      className="content-loading-icon"
                      role="status"
                      aria-label="正在加载内容"
                    />
                  )}
                </span>
              </span>
            }
            aside={<span>{result?.total ?? 0} 篇</span>}
          />
          <div className="content-filters">
            <Select
              label="状态"
              value={status}
              onChange={changeFilter(setStatus)}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'PUBLISHED', label: '已发布' },
                { value: 'DRAFT', label: '草稿' },
              ]}
            />
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
          <div className="content-list" tabIndex={0} aria-busy={loading} aria-label="内容列表">
            {visible.length ? (
              visible.map((article) => (
                <Button
                  variant="unstyled"
                  className="content-row"
                  key={article.id}
                  onClick={() => onOpen(article.id)}
                >
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
                    {article.status === 'PUBLISHED' && article.hasUnpublishedChanges && (
                      <span className="status-pill">有未发布修改</span>
                    )}
                    <time dateTime={article.updatedAt}>
                      {new Date(article.updatedAt).toLocaleDateString('zh-CN')}
                    </time>
                  </span>
                </Button>
              ))
            ) : !loading && !error ? (
              <EmptyState title="没有符合条件的内容" hint="试试调整筛选条件，或开始新的创作。" />
            ) : null}
          </div>
          <nav aria-label="管理内容分页" className="actions">
            <Button
              variant="secondary"
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </Button>
            <span>第 {result?.page ?? page} 页</span>
            <Button
              variant="secondary"
              disabled={loading || !result || page * result.pageSize >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </Button>
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
              <dt>本页内容数</dt>
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
        </Card>
      </div>
    </main>
  )
}
