import { NameCombobox } from '../../../shared/ui/NameCombobox'

export function EditorTaxonomy({
  article,
  category,
  categoryNames,
  tags,
  tagNames,
  tagInput,
  busy,
  onCategory,
  onCategoryCommit,
  onTagInput,
  onTagCommit,
  onRemoveTag,
}: {
  article: boolean
  category: string
  categoryNames: string[]
  tags: string[]
  tagNames: string[]
  tagInput: string
  busy: boolean
  onCategory: (value: string) => void
  onCategoryCommit: (value: string) => Promise<void>
  onTagInput: (value: string) => void
  onTagCommit: (value: string) => Promise<void>
  onRemoveTag: (value: string) => void
}) {
  return (
    <section className="editor-taxonomy" aria-label="分类与标签">
      <div className="editor-taxonomy-fields">
        {article && (
          <NameCombobox
            label="分类"
            value={category}
            names={categoryNames}
            maxLength={80}
            disabled={busy}
            onChange={onCategory}
            onCommit={onCategoryCommit}
          />
        )}
        <NameCombobox
          label="标签"
          value={tagInput}
          names={tagNames}
          selected={tags}
          maxLength={40}
          disabled={busy}
          limitReached={tags.length >= 20}
          onChange={onTagInput}
          onCommit={onTagCommit}
          onRemove={onRemoveTag}
        />
      </div>
    </section>
  )
}
