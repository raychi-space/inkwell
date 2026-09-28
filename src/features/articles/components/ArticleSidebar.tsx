import type { Article } from '../types'

type Props = {
  articles: Article[]
  currentId: string | null
  username: string | null
  busy: boolean
  onCreate: (type: Article['type']) => void
  onOpen: (id: string) => void
  onSettings: () => void
  onSignOut: () => void
}

export function ArticleSidebar({ articles, currentId, username, busy, onCreate, onOpen, onSettings, onSignOut }: Props) {
  return <aside className="sidebar">
      <div className="brand"><span>Raychi</span><strong>墨池</strong><small>内容管理</small></div>
      <div className="create-buttons"><button className="new-button" onClick={() => onCreate('ARTICLE')} disabled={busy}>＋ 长文</button>
        <button className="new-button" onClick={() => onCreate('POST')} disabled={busy}>＋ 帖子</button>
        <button className="new-button" onClick={() => onCreate('THOUGHT')} disabled={busy}>＋ 思考</button></div>
      <div className="sidebar-title">内容 <span>{articles.length}</span></div>
      <nav className="article-nav" aria-label="文章列表">
        {articles.map(article => <button key={article.id}
          className={currentId === article.id ? 'selected' : ''} onClick={() => onOpen(article.id)}>
          <span>{article.title || article.bodyMarkdown?.slice(0, 24) || '未命名内容'}</span>
          <small>{{ ARTICLE: '长文', POST: '帖子', THOUGHT: '思考' }[article.type]} · {article.status === 'PUBLISHED' ? (article.hasUnpublishedChanges ? '已发布 · 有待发布修改' : '已发布') : '草稿'}</small>
        </button>)}
      </nav>
      <button className="settings-link" onClick={onSettings}>网站设置</button>
      <div className="sidebar-foot"><span>{username}</span><button onClick={onSignOut}>退出</button></div>
    </aside>
}
