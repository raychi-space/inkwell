import { useId, useState, type KeyboardEvent } from 'react'

/** Free text picker: Enter reuses an exact name or creates the typed name. */
export function NameCombobox({ label, value, names, selected = [], maxLength, disabled = false, onChange, onCommit }: {
  label: string; value: string; names: string[]; selected?: string[]; maxLength: number; disabled?: boolean
  onChange: (value: string) => void; onCommit: (value: string) => Promise<void>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const [committing, setCommitting] = useState(false)
  const options = names.filter(name => !selected.includes(name) && (!typed || name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())))
  const exact = names.includes(value.trim())
  async function commit(name: string) {
    if (!name.trim() || committing || disabled) return
    setCommitting(true)
    try { await onCommit(name.trim()); setOpen(false); setTyped(false); setActive(-1) }
    finally { setCommitting(false) }
  }
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); setOpen(true)
      setActive(index => options.length ? (index < 0 ? (e.key === 'ArrowDown' ? 0 : options.length - 1) : (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length) : -1)
    } else if (e.key === 'Enter') { e.preventDefault(); void commit(active >= 0 && active < options.length ? options[active] : value) }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1) }
  }
  return <div className="name-combobox" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1) } }}>
    <label htmlFor={id}>{label}</label>
    <div className="name-combobox-input"><input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id + '-list'}
      aria-activedescendant={open && active >= 0 ? id + '-option-' + active : undefined} value={value} maxLength={maxLength}
      disabled={disabled || committing} placeholder={'选择或输入' + label} autoComplete="off"
      onFocus={() => { setOpen(true); setTyped(false) }} onChange={event => { onChange(event.target.value); setTyped(true); setOpen(true); setActive(-1) }} onKeyDown={keyDown} />
      <button type="button" aria-label={'确认' + label} disabled={disabled || committing || !value.trim()} onClick={() => void commit(value)}>{committing ? '…' : '↵'}</button>
    </div>
    {open && <div className="name-combobox-menu">
      <div id={id + '-list'} role="listbox" aria-label={'已有' + label}>
        {options.map((name, index) => <button type="button" role="option" aria-selected={active === index} id={id + '-option-' + index} key={name}
          onMouseDown={event => event.preventDefault()} onClick={() => void commit(name)}>{name}</button>)}
      </div>
      {!exact && value.trim() && <button type="button" className="name-create" onMouseDown={event => event.preventDefault()} onClick={() => void commit(value)}>新建「{value.trim()}」</button>}
      {!options.length && !value.trim() && <p>输入名称，按回车添加</p>}
    </div>}
  </div>
}
