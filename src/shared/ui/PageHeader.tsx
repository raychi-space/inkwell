import type { ReactNode } from 'react'

/** 管理台统一的页头：分类标签 + 标题 + 可选副标题与操作区。所有管理视图共用。 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  actionsLabel,
}: {
  kicker: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  actionsLabel?: string
}) {
  return (
    <header className="studio-head dashboard-head">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && (
        <div className="create-actions" aria-label={actionsLabel}>
          {actions}
        </div>
      )}
    </header>
  )
}
