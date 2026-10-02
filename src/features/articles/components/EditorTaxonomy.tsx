import { NameCombobox } from '../../../shared/ui/NameCombobox'

export function EditorTaxonomy({ article, category, categoryNames, tags, tagNames, tagInput, busy,
  onCategory, onCategoryCommit, onTagInput, onTagCommit, onRemoveTag }: {
  article: boolean; category: string; categoryNames: string[]; tags: string[]; tagNames: string[]; tagInput: string; busy: boolean
  onCategory: (value: string) => void; onCategoryCommit: (value: string) => Promise<void>
  onTagInput: (value: string) => void; onTagCommit: (value: string) => Promise<void>; onRemoveTag: (value: string) => void
}) {
  return <section className="editor-taxonomy" aria-label="分类与标签">
    <div className="editor-taxonomy-fields">
      {article && <NameCombobox label="分类" value={category} names={categoryNames} maxLength={80} disabled={busy} onChange={onCategory} onCommit={onCategoryCommit} />}
      <NameCombobox label="标签" value={tagInput} names={tagNames} selected={tags} maxLength={40} disabled={busy || tags.length >= 20} onChange={onTagInput} onCommit={onTagCommit} />
    </div>
    {tags.length > 0 && <div className="selected-tags" aria-label="已选标签">{tags.map(tag => <span key={tag}>{tag}<button type="button" aria-label={'移除标签 ' + tag} disabled={busy} onClick={() => onRemoveTag(tag)}>×</button></span>)}</div>}
  </section>
}
