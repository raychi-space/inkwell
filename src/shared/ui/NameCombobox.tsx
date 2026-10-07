import { useId, useState, useRef, useLayoutEffect, type KeyboardEvent } from 'react'

/** Free text picker: Enter reuses an exact name or creates the typed name. */
export function NameCombobox({
  label,
  value,
  names,
  selected = [],
  maxLength,
  disabled = false,
  limitReached = false,
  onChange,
  onCommit,
  onRemove,
}: {
  label: string
  value: string
  names: string[]
  selected?: string[]
  maxLength: number
  disabled?: boolean
  limitReached?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => Promise<void>
  onRemove?: (value: string) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240, maxHeight: 240 })
  const id = useId()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [active, setActive] = useState(-1)
  const [committing, setCommitting] = useState(false)
  const options = names.filter(
    (name) =>
      !selected.includes(name) &&
      (!typed || name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())),
  )
  const exact = names.includes(value.trim())
  useLayoutEffect(() => {
    if (!open || !menu.current) return
    const popup = menu.current
    popup.showPopover()
    function reposition() {
      const rect = root.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(rect.width, window.innerWidth - 16)
      const below = Math.max(0, window.innerHeight - rect.bottom - 13)
      const above = Math.max(0, rect.top - 13)
      const desired = Math.min(240, popup.scrollHeight)
      const up = below < desired && above > below
      const maxHeight = Math.min(240, up ? above : below)
      setPosition({
        width,
        maxHeight,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: Math.max(8, up ? rect.top - Math.min(desired, maxHeight) - 5 : rect.bottom + 5),
      })
    }
    const resize = new ResizeObserver(reposition)
    if (root.current) resize.observe(root.current)
    resize.observe(popup)
    reposition()
    window.addEventListener('resize', reposition)
    document.addEventListener('scroll', reposition, true)
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', reposition)
      document.removeEventListener('scroll', reposition, true)
      document.removeEventListener('pointerdown', outside)
      if (popup.matches(':popover-open')) popup.hidePopover()
    }
  }, [open, options.length, value])

  async function commit(name: string) {
    if (!name.trim() || committing || disabled || limitReached) return
    setCommitting(true)
    try {
      await onCommit(name.trim())
      setOpen(false)
      setTyped(false)
      setActive(-1)
    } finally {
      setCommitting(false)
    }
  }
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((index) =>
        options.length
          ? index < 0
            ? e.key === 'ArrowDown'
              ? 0
              : options.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
          : -1,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void commit(active >= 0 && active < options.length ? options[active] : value)
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
      }
      setOpen(false)
      setActive(-1)
    }
  }
  return (
    <div
      ref={root}
      className="name-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
          setActive(-1)
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className={'name-combobox-input' + (onRemove ? ' tag-combobox-input' : '')}>
        {onRemove &&
          selected.map((tag) => (
            <span className="input-tag" key={tag}>
              {tag}
              <button
                type="button"
                aria-label={'移除标签 ' + tag}
                disabled={disabled}
                onClick={() => onRemove(tag)}
              >
                ×
              </button>
            </span>
          ))}
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open && active >= 0 ? id + '-option-' + active : undefined}
          value={value}
          maxLength={maxLength}
          disabled={disabled || committing || limitReached}
          placeholder={onRemove ? '' : '选择或输入' + label}
          autoComplete="off"
          onFocus={() => {
            setOpen(true)
            setTyped(false)
          }}
          onChange={(event) => {
            onChange(event.target.value)
            setTyped(true)
            setOpen(true)
            setActive(-1)
          }}
          onKeyDown={keyDown}
        />
        <button
          type="button"
          aria-label={'确认' + label}
          disabled={disabled || committing || limitReached || !value.trim()}
          onClick={() => void commit(value)}
        >
          {committing ? '…' : '↵'}
        </button>
      </div>
      {open && (
        <div
          ref={menu}
          popover="manual"
          style={position}
          className="name-combobox-menu name-combobox-floating"
        >
          <div id={id + '-list'} role="listbox" aria-label={'已有' + label}>
            {options.map((name, index) => (
              <button
                type="button"
                role="option"
                aria-selected={active === index}
                id={id + '-option-' + index}
                key={name}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void commit(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {!exact && value.trim() && (
            <button
              type="button"
              className="name-create"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void commit(value)}
            >
              新建「{value.trim()}」
            </button>
          )}
          {!options.length && !value.trim() && <p>输入名称，按回车添加</p>}
        </div>
      )}
    </div>
  )
}
