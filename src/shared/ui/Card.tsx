import type { ComponentProps, ReactNode } from 'react'

export function Card({ className, children, ...rest }: ComponentProps<'section'>) {
  return <section className={className ? `dashboard-card ${className}` : 'dashboard-card'} {...rest}>{children}</section>
}

export function CardHead({ eyebrow, title, aside }: { eyebrow: string; title: ReactNode; aside?: ReactNode }) {
  return <div className="card-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{aside}</div>
}
