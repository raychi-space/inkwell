import type { ComponentProps } from 'react'
import './input.css'

/** Native input with shadcn-style states, using the studio theme tokens. */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={['studio-input', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
