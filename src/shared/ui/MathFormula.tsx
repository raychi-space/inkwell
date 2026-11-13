import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './math.css'

export const mathOptions = { trust: false, maxExpand: 1000, maxSize: 20, strict: 'warn' as const }

export function MathFormula({ value, display = false }: { value: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(value, {
        ...mathOptions,
        displayMode: display,
        throwOnError: false,
      })
    } catch {
      return null
    }
  }, [value, display])
  return html === null ? (
    <code>{value}</code>
  ) : (
    <span className="math-formula" dangerouslySetInnerHTML={{ __html: html }} />
  )
}
