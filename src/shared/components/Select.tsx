import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export type SelectOption = { value: string; label: string }

type Props = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  hint?: string
}

export function Select({ label, value, options, onChange, hint }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [opensUp, setOpensUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value))
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  useEffect(() => {
    if (open) menuRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function openMenu() {
    const rect = rootRef.current?.getBoundingClientRect()
    const containerBottom = rootRef.current?.closest('.metadata-panel')?.getBoundingClientRect().bottom ?? window.innerHeight
    const menuHeight = Math.min(240, options.length * 37 + 10)
    setOpensUp(!!rect && Math.min(containerBottom, window.innerHeight) - rect.bottom < menuHeight && rect.top > menuHeight)
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false) }
      return
    }
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(activeIndex)
      else openMenu()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) { openMenu(); return }
      setActiveIndex(index => event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    }
  }

  return <div className="studio-select" ref={rootRef}>
    <span className="select-label" id={`${id}-label`}>{label}</span>
    <button ref={buttonRef} id={`${id}-button`} type="button" className={`select-trigger${open ? ' open' : ''}`}
      role="combobox" aria-labelledby={`${id}-label ${id}-button`} aria-controls={`${id}-list`}
      aria-expanded={open} aria-haspopup="listbox"
      aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
      onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={onKeyDown}>
      <span>{selected?.label ?? '请选择'}</span><span className="select-chevron" aria-hidden="true" />
    </button>
    {open && <div ref={menuRef} id={`${id}-list`} className={`select-menu${opensUp ? ' up' : ''}`} role="listbox" aria-labelledby={`${id}-label`}>
      {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option"
        aria-selected={option.value === value} className={`select-option${index === activeIndex ? ' focused' : ''}`}
        onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}
      </div>)}
    </div>}
    {hint && <small className="select-hint">{hint}</small>}
  </div>
}
