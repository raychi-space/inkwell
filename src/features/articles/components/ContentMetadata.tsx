import type { Article } from '../types'
import { Select } from '../../../shared/ui/Select'

interface Props {
  article: Article
  title: string; slug: string; summary: string; coverUrl: string; category: string
  categoryNames: string[]; tagNames: string[]; selectedTags: string[]
  newCategory: string; newTag: string; summaryStatus: string; manualSummary: boolean
  onTitle: (value: string) => void; onSlug: (value: string) => void
  onSummary: (value: string) => void; onCover: (value: string) => void
  onCategory: (value: string) => void; onTags: (value: string[]) => void
  onNewCategory: (value: string) => void; onNewTag: (value: string) => void
  onAddCategory: () => void; onAddTag: () => void; onResumeSummary: () => void
}
export function ContentMetadata(p: Props) {
  const article = p.article.type === 'ARTICLE'
  return <aside className="dashboard-card metadata-panel metadata-top" aria-label="内容信息">
    <div className="metadata-heading"><h2>内容信息</h2>{article && <small role="status">{p.summaryStatus}</small>}</div>
    <div className="metadata-primary fields">
      <label>标题{!article && '（可选）'}<input value={p.title} onChange={e => p.onTitle(e.target.value)} placeholder={article ? '给文章一个标题' : '可以留空'} /></label>
      {article && <Select label="分类" value={p.category} onChange={p.onCategory} options={[...new Set(['未分类', ...p.categoryNames])].map(name => ({ value: name, label: name }))} />}
    </div>
    <details className="metadata-details">
      <summary>{article ? '摘要、链接与标签' : '标签'}</summary>
      {article && <div className="fields metadata-secondary">
        <label className="metadata-summary">摘要<textarea value={p.summary} onChange={e => p.onSummary(e.target.value)} rows={2} placeholder="正文停顿后自动生成；也可以手动填写" />{p.manualSummary && <button type="button" className="text-button" onClick={p.onResumeSummary}>恢复自动摘要</button>}</label>
        <label>地址别名<input value={p.slug} onChange={e => p.onSlug(e.target.value)} disabled={!!p.article.publishedAt} placeholder="例如 my-first-article" /></label>
        <label>封面地址（可选）<input value={p.coverUrl} onChange={e => p.onCover(e.target.value)} placeholder="图片地址" /></label>
        <div className="taxonomy-add"><input aria-label="新分类名称" value={p.newCategory} onChange={e => p.onNewCategory(e.target.value)} placeholder="新分类名称" /><button onClick={p.onAddCategory}>添加分类</button></div>
      </div>}
      <div className="taxonomy-options"><strong>标签</strong>{p.tagNames.map(name => <label key={name}><input type="checkbox" checked={p.selectedTags.includes(name)} onChange={e => p.onTags(e.target.checked ? [...p.selectedTags, name] : p.selectedTags.filter(tag => tag !== name))} />{name}</label>)}
        <div className="taxonomy-add"><input aria-label="新标签名称" value={p.newTag} onChange={e => p.onNewTag(e.target.value)} placeholder="新标签名称" /><button onClick={p.onAddTag}>添加标签</button></div>
      </div>
    </details>
  </aside>
}
