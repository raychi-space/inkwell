import { Button } from '../shared/ui/Button'
import { useSessionState } from '../shared/lib/useSessionState'
import { ContentDashboard, type Article } from '../features/articles'
import { TaxonomyManager } from '../features/taxonomy/TaxonomyManager'

type Props = {
  categories: string[]
  tags: string[]
  busy: boolean
  notice: string
  onCreate: (type: Article['type']) => void
  onOpen: (id: string) => void
  onTrash: () => void
  onChanged: () => void
  onDirtyChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
  dirty: boolean
  pending: boolean
}
export function ContentManagement(p: Props) {
  const [tab, setTab] = useSessionState<'contents' | 'categories' | 'tags'>(
    'content.tab',
    'contents',
  )
  const navigation = (
    <nav className="reading-tabs management-tabs" aria-label="内容管理页签">
      {(
        [
          ['contents', '内容'],
          ['categories', '分类'],
          ['tags', '标签'],
        ] as const
      ).map(([key, label]) => (
        <Button
          variant="unstyled"
          key={key}
          aria-current={tab === key ? 'page' : undefined}
          className={tab === key ? 'active' : ''}
          disabled={p.pending}
          onClick={() => {
            if (tab !== key && (!p.dirty || window.confirm('当前修改尚未保存，确定放弃吗？')))
              setTab(key)
          }}
        >
          {label}
        </Button>
      ))}
    </nav>
  )
  return tab === 'contents' ? (
    <ContentDashboard {...p} navigation={navigation} />
  ) : (
    <TaxonomyManager key={tab} {...p} kind={tab} navigation={navigation} />
  )
}
