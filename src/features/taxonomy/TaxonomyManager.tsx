import { Card } from '../../shared/ui/Card'
import { Input } from '../../shared/ui/Input'
import { Button } from '../../shared/ui/Button'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addCategory,
  addTag,
  managementTaxonomy,
  taxonomyReferences,
  renameTaxonomy,
  deleteTaxonomy,
  type TaxonomyKind,
  type TaxonomyItem,
  type TaxonomyReference,
} from './api'
import { PageHeader } from '../../shared/ui/PageHeader'
import { errorMessage } from '../../shared/lib/errors'

type Props = {
  kind: TaxonomyKind
  navigation: ReactNode
  onOpen: (id: string) => void
  onTrash: () => void
  onChanged: () => void
  onDirtyChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
}
export function TaxonomyManager(p: Props) {
  const label = p.kind === 'categories' ? '分类' : '标签'
  const [items, setItems] = useState<TaxonomyItem[]>([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [nextName, setNextName] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [referenceName, setReferenceName] = useState('')
  const [references, setReferences] = useState<TaxonomyReference[] | null>(null)
  const referenceGeneration = useRef(0)
  const submitting = useRef(false)
  const alive = useRef(true)
  const dirty = !!name || (editing !== null && nextName !== editing)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      referenceGeneration.current++
    }
  }, [])
  useEffect(() => {
    p.onDirtyChange(dirty)
    return () => p.onDirtyChange(false)
  }, [dirty, p.onDirtyChange])
  useEffect(() => {
    p.onBusyChange(busy)
    return () => p.onBusyChange(false)
  }, [busy, p.onBusyChange])
  useEffect(() => {
    let active = true
    setLoading(true)
    void managementTaxonomy(p.kind)
      .then((v) => {
        if (active) setItems(v)
      })
      .catch((e) => {
        if (active) setNotice(errorMessage(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [p.kind, revision])
  async function mutate(action: () => Promise<unknown>) {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setNotice('')
    try {
      await action()
      if (alive.current) {
        setName('')
        setEditing(null)
        setNextName('')
        setNotice('已保存。')
        referenceGeneration.current++
        setReferenceName('')
        setReferences(null)
        setRevision((v) => v + 1)
        p.onChanged()
      }
    } catch (e) {
      if (alive.current) setNotice(errorMessage(e))
    } finally {
      submitting.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function showReferences(value: string) {
    const generation = ++referenceGeneration.current
    setReferenceName(value)
    setReferences(null)
    setNotice('')
    try {
      const rows = await taxonomyReferences(p.kind, value)
      if (referenceGeneration.current === generation) setReferences(rows)
    } catch (e) {
      if (referenceGeneration.current === generation) setNotice(errorMessage(e))
    }
  }
  const rows = items.filter((v) => v.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return (
    <main className="workspace studio-page management-page">
      <PageHeader kicker="CONTENT STUDIO" title="内容管理" />
      {p.navigation}
      <div className="management-scroll taxonomy-management">
        <Card>
          <h2>{label}管理</h2>
          <form
            className="taxonomy-create"
            onSubmit={(e) => {
              e.preventDefault()
              void mutate(() => (p.kind === 'categories' ? addCategory(name) : addTag(name)))
            }}
          >
            <label>
              新增{label}
              <Input
                required
                maxLength={p.kind === 'categories' ? 80 : 40}
                disabled={busy || editing !== null}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <Button
              variant="primary"
              type="submit"
              className="primary"
              disabled={busy || editing !== null || !name.trim()}
            >
              新增
            </Button>
          </form>
          <label>
            搜索{label}
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {loading && <p role="status">正在加载…</p>}
          <div className="reading-table-wrap">
            <table className="reading-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>工作稿</th>
                  <th>发布版本</th>
                  <th>回收站</th>
                  <th>历史版本</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.name}>
                    <td>
                      {editing === v.name ? (
                        <Input
                          aria-label="新名称"
                          maxLength={p.kind === 'categories' ? 80 : 40}
                          value={nextName}
                          disabled={busy}
                          onChange={(e) => setNextName(e.target.value)}
                        />
                      ) : (
                        v.name
                      )}
                    </td>
                    <td>{v.draftCount}</td>
                    <td>{v.publicCount}</td>
                    <td>{v.trashCount}</td>
                    <td>{v.historyCount}</td>
                    <td>
                      <div className="actions">
                        <Button
                          variant="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void showReferences(v.name)}
                        >
                          查看引用（{v.referenceCount}）
                        </Button>
                        {editing === v.name ? (
                          <>
                            <Button
                              variant="secondary"
                              disabled={busy || !nextName.trim() || nextName === v.name}
                              onClick={() =>
                                void mutate(() => renameTaxonomy(p.kind, v.name, nextName))
                              }
                            >
                              保存名称
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setEditing(null)
                                setNextName('')
                              }}
                            >
                              取消
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              disabled={busy || dirty || v.protectedName || v.referenceCount > 0}
                              onClick={() => {
                                setEditing(v.name)
                                setNextName(v.name)
                              }}
                            >
                              重命名
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={busy || dirty || v.protectedName || v.referenceCount > 0}
                              onClick={() => {
                                if (window.confirm(`确定删除${label}“${v.name}”吗？`))
                                  void mutate(() => deleteTaxonomy(p.kind, v.name))
                              }}
                            >
                              删除
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !rows.length && <p>没有符合条件的{label}。</p>}
          <p className="settings-help">
            仅未被引用的项可更名或删除，“未分类”保留。各列按内容去重，同一篇内容可出现在多列。
          </p>
        </Card>
        {referenceName && (
          <Card aria-label="关联内容">
            <h2>“{referenceName}”的关联内容</h2>
            {references === null ? (
              <p>正在查询…</p>
            ) : references.length ? (
              <ul className="taxonomy-references">
                {references.map((v) => (
                  <li key={v.id}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => (v.status === 'TRASHED' ? p.onTrash() : p.onOpen(v.id))}
                    >
                      {v.title || '未命名内容'} ·{' '}
                      {v.status === 'TRASHED'
                        ? '回收站'
                        : v.status === 'PUBLISHED'
                          ? '已发布'
                          : '草稿'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无引用。</p>
            )}
          </Card>
        )}
      </div>
    </main>
  )
}
