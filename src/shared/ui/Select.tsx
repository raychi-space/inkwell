import { createPortal } from 'react-dom'
import {
  useLayoutEffect,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export type SelectOption = { value: string; label: string; icon?: ReactNode }

type Props = {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  labelIcon?: ReactNode
  disabled?: boolean
  floating?: boolean
  hint?: string
}

export function Select({
  label,
  value,
  options,
  onChange,
  hint,
  labelIcon,
  disabled,
  floating = false,
}: Props) {
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, maxHeight: 240 })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [opensUp, setOpensUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const selected = options[selectedIndex]

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  useEffect(() => {
    if (open)
      menuRef.current
        ?.querySelectorAll('[role="option"]')
        [activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useLayoutEffect(() => {
    if (!open || !floating) return
    function reposition() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(280, window.innerWidth - 16)
      const below = Math.max(0, window.innerHeight - rect.bottom - 13)
      const above = Math.max(0, rect.top - 13)
      const desired = Math.min(240, menuRef.current?.scrollHeight ?? 240)
      const up = below < desired && above > below
      const maxHeight = Math.min(240, up ? above : below)
      const height = Math.min(desired, maxHeight)
      setPosition({
        width,
        maxHeight,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, up ? rect.top - height - 5 : rect.bottom + 5),
      })
    }
    const resize = new ResizeObserver(reposition)
    if (rootRef.current) resize.observe(rootRef.current)
    if (menuRef.current) resize.observe(menuRef.current)
    reposition()
    window.addEventListener('resize', reposition)
    document.addEventListener('scroll', reposition, true)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', reposition)
      document.removeEventListener('scroll', reposition, true)
    }
  }, [open, floating, options.length])

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function openMenu() {
    const rect = rootRef.current?.getBoundingClientRect()
    const containerBottom =
      rootRef.current?.closest('.metadata-panel')?.getBoundingClientRect().bottom ??
      window.innerHeight
    const menuHeight = Math.min(240, options.length * 37 + 10)
    setOpensUp(
      !!rect &&
        Math.min(containerBottom, window.innerHeight) - rect.bottom < menuHeight &&
        rect.top > menuHeight,
    )
    setActiveIndex(selectedIndex)
    setOpen(true)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(activeIndex)
      else openMenu()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) {
        openMenu()
        return
      }
      setActiveIndex((index) =>
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
      )
    }
  }

  const menu = open && (
    <div
      ref={menuRef}
      id={`${id}-list`}
      className={`select-menu${floating ? ' select-menu-floating' : opensUp ? ' up' : ''}`}
      style={floating ? position : undefined}
      role="listbox"
      aria-labelledby={`${id}-label`}
    >
      {options.map((option, index) => (
        <div
          id={`${id}-option-${index}`}
          key={option.value}
          role="option"
          aria-selected={option.value === value}
          className={`select-option${index === activeIndex ? ' focused' : ''}`}
          onMouseMove={() => setActiveIndex(index)}
          onClick={() => choose(index)}
        >
          <span className="select-value">
            {option.icon}
            <span>{option.label}</span>
          </span>
          {option.value === value && <span aria-hidden="true">✓</span>}
        </div>
      ))}
    </div>
  )

  return (
    <div className={'studio-select' + (labelIcon ? ' icon-label-select' : '')} ref={rootRef}>
      <span className="select-label" id={`${id}-label`}>
        {labelIcon}
        <span className={labelIcon ? 'sr-only' : undefined}>{label}</span>
      </span>
      <button
        disabled={disabled}
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        title={selected?.label ?? label}
        className={`select-trigger${open ? ' open' : ''}`}
        role="combobox"
        aria-labelledby={`${id}-label ${id}-button`}
        aria-controls={`${id}-list`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">
          {selected?.icon}
          <span>{selected?.label ?? '请选择'}</span>
        </span>
        <span className="select-chevron" aria-hidden="true" />
      </button>
      {floating && menu ? createPortal(menu, document.body) : menu}
      {hint && <small className="select-hint">{hint}</small>}
    </div>
  )
}
