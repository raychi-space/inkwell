import type { ComponentProps } from 'react'
import './input.css'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={['studio-input', 'studio-textarea', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
