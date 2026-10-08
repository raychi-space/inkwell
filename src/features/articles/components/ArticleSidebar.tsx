import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../shared/ui/Icon'

type Props = {
  active: 'content' | 'drafts' | 'settings' | 'ai' | 'password' | 'analytics'
  username: string | null
  siteName: string
  avatarUrl: string | null
  collapsed: boolean
  onToggle: () => void
  onContent: () => void
  onDrafts: () => void
  onSettings: () => void
  onAI: () => void
  onAnalytics: () => void
  onChangePassword: () => void
  onSignOut: () => void
}

export function ArticleSidebar(p: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const account = useRef<HTMLDivElement>(null)
  const accountButton = useRef<HTMLButtonElement>(null)
  const logoutButton = useRef<HTMLButtonElement>(null)
  useEffect(() => setImageFailed(false), [p.avatarUrl])
  useEffect(() => {
    if (!menuOpen) return
    logoutButton.current?.focus()
    const close = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])
  const entries = [
    { id: 'content', label: '内容管理', icon: 'content', action: p.onContent },
    { id: 'drafts', label: '草稿箱', icon: 'draft', action: p.onDrafts },
    { id: 'settings', label: '网站管理', icon: 'settings', action: p.onSettings },
    { id: 'ai', label: '助手管理', icon: 'assistant', action: p.onAI },
    { id: 'analytics', label: '访问统计', icon: 'analytics', action: p.onAnalytics },
  ] as const
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <button
          className="brand"
          onClick={p.collapsed ? p.onToggle : p.onContent}
          aria-label={p.collapsed ? '展开侧边栏' : '返回内容管理'}
          title={p.collapsed ? '展开侧边栏' : '返回内容管理'}
        >
          <span className="brand-mark">R</span>
          <span className="brand-name sidebar-label" aria-hidden={p.collapsed}>
            <strong>{p.siteName || '墨池'}</strong>
            <small>墨池 · 内容工作台</small>
          </span>
        </button>
        {!p.collapsed && (
          <button
            className="sidebar-collapse"
            onClick={p.onToggle}
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <Icon name="collapse" size={17} />
          </button>
        )}
      </div>
      <nav className="studio-nav" aria-label="管理导航">
        {entries.map((entry) => (
          <button
            key={entry.id}
            className={p.active === entry.id ? 'active' : ''}
            aria-label={entry.label}
            title={p.collapsed ? entry.label : undefined}
            aria-current={p.active === entry.id ? 'page' : undefined}
            onClick={entry.action}
          >
            <Icon name={entry.icon} />
            <span className="sidebar-label" aria-hidden={p.collapsed}>
              {entry.label}
            </span>
          </button>
        ))}
      </nav>
      <div
        className="sidebar-foot"
        ref={account}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setMenuOpen(false)
            accountButton.current?.focus()
          }
        }}
      >
        <button
          className="account-trigger"
          ref={accountButton}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`${p.username ?? '站主'}，账户菜单`}
          aria-expanded={menuOpen}
          aria-controls="sidebar-account-menu"
          title={p.collapsed ? '账户菜单' : undefined}
        >
          <span className="account-avatar">
            {p.avatarUrl && !imageFailed ? (
              <img src={p.avatarUrl} alt="" onError={() => setImageFailed(true)} />
            ) : (
              <Icon name="user" size={19} />
            )}
          </span>
          <span className="account-name sidebar-label" aria-hidden={p.collapsed}>
            <strong>{p.username ?? '站主'}</strong>
            <small>站主账户</small>
          </span>
          <span className="sidebar-label" aria-hidden={p.collapsed}>
            <Icon name="chevron" size={15} />
          </span>
        </button>
        {menuOpen && (
          <div className="account-popover" id="sidebar-account-menu">
            <div className="account-popover-heading">
              <strong>{p.username ?? '站主'}</strong>
              <small>当前登录账户</small>
            </div>
            <button
              className="account-logout"
              onClick={() => {
                setMenuOpen(false)
                p.onChangePassword()
              }}
            >
              <Icon name="settings" size={17} />
              修改密码
            </button>
            <button
              ref={logoutButton}
              className="account-logout"
              onClick={() => {
                setMenuOpen(false)
                p.onSignOut()
              }}
            >
              <Icon name="logout" size={17} />
              退出登录
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
