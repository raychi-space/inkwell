import type { Article } from '../types'

export function ContentMetadata({ article, title, summary, summaryStatus }: {
  article: Article; title: string; summary: string; summaryStatus: string
}) {
  if (article.type !== 'ARTICLE') return null
  return <aside className="dashboard-card metadata-panel metadata-top" aria-label="内容信息">
    <div className="metadata-heading"><h2>{title || '在正文中写下第一个标题'}</h2><small role="status">{summaryStatus}</small></div>
    <p className="metadata-address">地址别名 <code>{article.slug.startsWith('draft-') ? '保存时按日期生成' : article.slug}</code></p>
    <details className="metadata-details"><summary>文章摘要</summary>
      <p className="published-summary">{summary || '发布后自动生成摘要。'}</p>
    </details>
  </aside>
}
