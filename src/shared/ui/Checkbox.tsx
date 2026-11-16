import type { ComponentProps } from 'react'
import './controls.css'

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="checkbox"
      data-slot="checkbox"
      className={['studio-checkbox', className].filter(Boolean).join(' ')}
    />
  )
}
