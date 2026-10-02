import { useEffect, useRef, useState } from 'react'

export function useConfigSwitch(busy: boolean) {
  const [pendingChoice, setPendingChoice] = useState<{ label: string; action: () => void } | null>(
    null,
  )
  const cancelChoice = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (pendingChoice) cancelChoice.current?.focus()
  }, [pendingChoice])
  function choose(dirty: boolean, label: string, action: () => void) {
    if (busy) return
    if (dirty) {
      returnFocus.current = document.activeElement as HTMLElement
      setPendingChoice({ label, action })
    } else action()
  }
  function closeChoice() {
    setPendingChoice(null)
    returnFocus.current?.focus()
  }
  const dialog = (
    <>
      {pendingChoice && (
        <div className="management-dialog-backdrop">
          <section
            className="management-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="switch-config-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeChoice()
              }
              if (event.key === 'Tab') {
                const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
                const next = event.shiftKey ? items[0] : items[items.length - 1]
                if (document.activeElement === next) {
                  event.preventDefault()
                  ;(event.shiftKey ? items[items.length - 1] : items[0])?.focus()
                }
              }
            }}
          >
            <h2 id="switch-config-title">保留当前修改？</h2>
            <p>当前{pendingChoice.label}有未保存的修改，继续切换会放弃这些修改。</p>
            <div className="actions">
              <button ref={cancelChoice} onClick={closeChoice}>
                返回编辑
              </button>
              <button
                className="primary"
                onClick={() => {
                  pendingChoice.action()
                  closeChoice()
                }}
              >
                放弃修改并切换
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
  return { choose, dialog }
}
