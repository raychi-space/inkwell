export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="list-empty"><span className="list-empty-star" aria-hidden="true">✳</span>
    <strong>{title}</strong>{hint && <p>{hint}</p>}</div>
}
