import { BrandMark } from './BrandMark'

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="list-empty">
      <BrandMark />
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  )
}
