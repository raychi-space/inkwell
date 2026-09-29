type Props = {
  active: 'content' | 'drafts' | 'settings'
  username: string | null
  onContent: () => void
  onDrafts: () => void
  onSettings: () => void
  onSignOut: () => void
}

export function ArticleSidebar({ active, username, onContent, onDrafts, onSettings, onSignOut }: Props) {
  return <aside className="sidebar">
    <button className="brand" onClick={onContent} aria-label="返回内容管理">
      <span className="brand-mark">R</span>
      <span className="brand-name"><strong>Raychi</strong><small>墨池 · 内容工作台</small></span>
    </button>
    <nav className="studio-nav" aria-label="管理导航">
      <button className={active === 'content' ? 'active' : ''} aria-current={active === 'content' ? 'page' : undefined} onClick={onContent}>
        <span className="nav-symbol" aria-hidden="true">▤</span>内容管理
      </button>
      <button className={active === 'drafts' ? 'active' : ''} aria-current={active === 'drafts' ? 'page' : undefined} onClick={onDrafts}>
        <span className="nav-symbol" aria-hidden="true">▧</span>草稿箱
      </button>
      <button className={active === 'settings' ? 'active' : ''} aria-current={active === 'settings' ? 'page' : undefined} onClick={onSettings}>
        <span className="nav-symbol" aria-hidden="true">⚙</span>网站管理
      </button>
    </nav>
    <div className="sidebar-foot"><span>{username}</span><button onClick={onSignOut}>退出登录</button></div>
  </aside>
}
