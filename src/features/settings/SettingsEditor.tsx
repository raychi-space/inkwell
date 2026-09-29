import { useEffect, useState } from 'react'
import { getSettings, saveSettings, type SiteLink, type SiteSettings } from './api'
import { errorMessage } from '../../shared/errors'

const sectionNames = { feed: '混合信息流', writing: '长文精选', posts: '近期帖子', thoughts: '近期思考' }

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
      <LinkEditor title="联系方式" links={value.contacts} onChange={contacts => setValue({ ...value, contacts })} />
      <LinkEditor title="外部账户" links={value.accounts} onChange={accounts => setValue({ ...value, accounts })} />
      <LinkEditor title="导航" links={value.navigation} onChange={navigation => setValue({ ...value, navigation })} />
      <fieldset className="settings-group"><legend>首页区块</legend>
        {value.homeSections.map((section, index) => <div className="section-row" key={section.id}>
          <label><input type="checkbox" checked={section.visible} onChange={e => setValue({ ...value, homeSections: value.homeSections.map(item => item.id === section.id ? { ...item, visible: e.target.checked } : item) })} />{sectionNames[section.id]}</label>
          <button disabled={index === 0} onClick={() => { const next = [...value.homeSections]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setValue({ ...value, homeSections: next }) }}>↑</button>
          <button disabled={index === value.homeSections.length - 1} onClick={() => { const next = [...value.homeSections]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setValue({ ...value, homeSections: next }) }}>↓</button>
        </div>)}
      </fieldset>
      {notice && <p className="notice" role="status">{notice}</p>}
    </div>
  </main>
}
