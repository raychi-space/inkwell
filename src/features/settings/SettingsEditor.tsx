import { useEffect, useState } from 'react'
import { siGithub, siX, siBilibili, siYoutube, siZhihu, siJuejin, siXiaohongshu, siMastodon } from 'simple-icons'
import { getSettings, saveSettings, type HomepageProject, type HomepageSection, type SiteLink, type SiteSettings, type SocialAccount } from './api'
import { errorMessage } from '../../shared/errors'

const sectionNames: Record<HomepageSection['id'], string> = {
  featured: '精选文章', posts: '最近的帖子', writing: '最近的文章', projects: '最近在做', stats: '站点数据',
}

const socialPlatforms = [
  { id: 'github', name: 'GitHub', path: siGithub.path },
  { id: 'x', name: 'X', path: siX.path },
  { id: 'bilibili', name: '哔哩哔哩', path: siBilibili.path },
  { id: 'youtube', name: 'YouTube', path: siYoutube.path },
  { id: 'zhihu', name: '知乎', path: siZhihu.path },
  { id: 'juejin', name: '掘金', path: siJuejin.path },
  { id: 'xiaohongshu', name: '小红书', path: siXiaohongshu.path },
  { id: 'mastodon', name: 'Mastodon', path: siMastodon.path },
] as const

function SocialAccountsEditor({ accounts, onChange }: { accounts: SocialAccount[]; onChange: (accounts: SocialAccount[]) => void }) {
  const update = (id: string, patch: Partial<SocialAccount>) => onChange(socialPlatforms.map(platform => ({
    ...(accounts.find(account => account.platform === platform.id) ?? { platform: platform.id, enabled: false, href: '' }),
    ...(platform.id === id ? patch : {}),
  })))
  return <fieldset className="settings-group"><legend>外部账户</legend>
    <p className="settings-help">打开需要展示的平台，再填写该平台的完整网址。访客看到对应图标。</p>
    <div className="social-account-list">{socialPlatforms.map(platform => {
      const account = accounts.find(item => item.platform === platform.id)
      return <div className="social-account-row" key={platform.id}>
        <label className="social-account-toggle"><input type="checkbox" checked={account?.enabled ?? false}
          onChange={event => update(platform.id, { enabled: event.target.checked })} />
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={platform.path} /></svg><span>{platform.name}</span></label>
        <input aria-label={`${platform.name} 链接`} type="url" maxLength={500} placeholder="https://…"
          value={account?.href ?? ''} onChange={event => update(platform.id, { href: event.target.value })} />
      </div>
    })}</div>
  </fieldset>
}

function SectionEditor({ title, sections, onChange }: { title: string; sections: HomepageSection[]; onChange: (sections: HomepageSection[]) => void }) {
  return <fieldset className="settings-group"><legend>{title}</legend>
    {sections.map((section, index) => <div className="section-row" key={section.id}>
      <label><input type="checkbox" checked={section.visible} onChange={e => onChange(sections.map(item => item.id === section.id ? { ...item, visible: e.target.checked } : item))} />{sectionNames[section.id]}</label>
      <button type="button" aria-label={`上移${sectionNames[section.id]}`} disabled={index === 0} onClick={() => {
        const next = [...sections]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next)
      }}>↑</button>
      <button type="button" aria-label={`下移${sectionNames[section.id]}`} disabled={index === sections.length - 1} onClick={() => {
        const next = [...sections]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next)
      }}>↓</button>
    </div>)}
  </fieldset>
}

function ProjectEditor({ projects, onChange }: { projects: HomepageProject[]; onChange: (projects: HomepageProject[]) => void }) {
  const update = (index: number, patch: Partial<HomepageProject>) => onChange(projects.map((item, n) => n === index ? { ...item, ...patch } : item))
  return <fieldset className="settings-group"><legend>最近在做 · 项目</legend>
    <p className="settings-help">首页最多展示 3 个项目。名称、状态和链接会公开显示。</p>
    {projects.map((project, index) => <div className="settings-project" key={index}>
      <div className="settings-project-head"><strong>项目 {index + 1}</strong><div>
        <button type="button" disabled={index === 0} aria-label={`上移项目 ${index + 1}`} onClick={() => { const next = [...projects]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>↑</button>
        <button type="button" disabled={index === projects.length - 1} aria-label={`下移项目 ${index + 1}`} onClick={() => { const next = [...projects]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next) }}>↓</button>
        <button type="button" onClick={() => onChange(projects.filter((_, n) => n !== index))}>删除</button>
      </div></div>
      <div className="settings-project-fields">
        <label>名称<input maxLength={80} value={project.name} onChange={e => update(index, { name: e.target.value })} /></label>
        <label>当前状态<input maxLength={40} value={project.status} onChange={e => update(index, { status: e.target.value })} /></label>
        <label className="settings-wide">一句话说明<input maxLength={240} value={project.description} onChange={e => update(index, { description: e.target.value })} /></label>
        <label className="settings-wide">详情链接<input maxLength={500} placeholder="https://… 或 /路径" value={project.href} onChange={e => update(index, { href: e.target.value })} /></label>
      </div>
    </div>)}
    <button type="button" disabled={projects.length >= 3} onClick={() => onChange([...projects, { name: '新项目', description: '', status: '进行中', href: '/' }])}>＋ 添加项目</button>
  </fieldset>
}

function LinkEditor({ title, links, onChange }: { title: string; links: SiteLink[]; onChange: (links: SiteLink[]) => void }) {
  return <fieldset className="settings-group"><legend>{title}</legend>
    {links.map((link, index) => <div className="link-row" key={index}>
      <input aria-label={`${title} ${index + 1} 名称`} placeholder="名称" value={link.label}
        onChange={e => onChange(links.map((item, n) => n === index ? { ...item, label: e.target.value } : item))} />
      <input aria-label={`${title} ${index + 1} 链接`} placeholder="https://… 或 /路径" value={link.href}
        onChange={e => onChange(links.map((item, n) => n === index ? { ...item, href: e.target.value } : item))} />
      <button type="button" onClick={() => onChange(links.filter((_, n) => n !== index))}>删除</button>
    </div>)}
    <button type="button" onClick={() => onChange([...links, { label: '', href: '' }])}>＋ 添加</button>
  </fieldset>
}

export function SettingsEditor({ onBack }: { onBack: () => void }) {
  const [value, setValue] = useState<SiteSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { getSettings().then(setValue).catch(error => setNotice(errorMessage(error))) }, [])

  async function save() {
    if (!value) return
    const invalidAccount = value.socialAccounts.find(account => account.enabled && !/^https?:\/\/[^\s]+$/i.test(account.href))
    if (invalidAccount) {
      const name = socialPlatforms.find(platform => platform.id === invalidAccount.platform)?.name ?? invalidAccount.platform
      setNotice(`请先填写 ${name} 的完整 HTTP(S) 链接。`)
      return
    }
    setBusy(true)
    try { setValue(await saveSettings(value)); setNotice('站点设置已保存，访客刷新后即可看到。') }
    catch (error) { setNotice(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (!value) return <main className="workspace"><div className="editor-page">{notice || '正在加载网站设置…'}</div></main>
  return <main className="workspace">
    <header className="editor-head"><div><p className="eyebrow">网站设置</p><h1>公开展示</h1></div>
      <div className="actions"><button onClick={onBack}>返回内容</button><button className="primary" disabled={busy} onClick={() => void save()}>保存设置</button></div></header>
    <div className="editor-page settings-page">
      <div className="fields">
        <label>站名<input value={value.siteName} onChange={e => setValue({ ...value, siteName: e.target.value })} /></label>
        <label>头像地址<input value={value.avatarUrl ?? ''} onChange={e => setValue({ ...value, avatarUrl: e.target.value || null })} placeholder="https://…" /></label>
        <label>简短介绍<textarea rows={3} value={value.intro} onChange={e => setValue({ ...value, intro: e.target.value })} /></label>
      </div>
      <fieldset className="settings-group"><legend>首页个人介绍</legend>
        <p className="settings-help">首页姓名使用站名；介绍、头像和下方外部链接也在本页修改。</p>
        <label className="settings-single-field">当前关注方向<input maxLength={160} value={value.homepage.focus}
          onChange={e => setValue({ ...value, homepage: { ...value.homepage, focus: e.target.value } })} /></label>
      </fieldset>
      <ProjectEditor projects={value.homepage.projects} onChange={projects => setValue({ ...value, homepage: { ...value.homepage, projects } })} />
      <fieldset className="settings-group"><legend>最近在做 · 说明</legend>
        <label className="settings-single-field">区块引言<input maxLength={240} value={value.projectIntro}
          onChange={e => setValue({ ...value, projectIntro: e.target.value })} /></label>
      </fieldset>
      <SectionEditor title="首屏内容顺序与显示" sections={value.homepage.recentSections}
        onChange={recentSections => setValue({ ...value, homepage: { ...value.homepage, recentSections } })} />
      <SectionEditor title="页面下方顺序与显示" sections={value.homepage.bottomSections}
        onChange={bottomSections => setValue({ ...value, homepage: { ...value.homepage, bottomSections } })} />
      <LinkEditor title="联系方式" links={value.contacts} onChange={contacts => setValue({ ...value, contacts })} />
      <SocialAccountsEditor accounts={value.socialAccounts} onChange={socialAccounts => setValue({ ...value, socialAccounts })} />
      <LinkEditor title="其他外部链接" links={value.accounts} onChange={accounts => setValue({ ...value, accounts })} />
      <LinkEditor title="导航" links={value.navigation} onChange={navigation => setValue({ ...value, navigation })} />
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
  </main>
}
