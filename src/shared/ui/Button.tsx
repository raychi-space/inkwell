import type { ComponentProps } from 'react'
import './controls.css'

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'unstyled'
}

export function Button({ variant = 'secondary', className, ...props }: Props) {
  return (
    <button
      data-slot="button"
      className={['studio-button', `studio-button-${variant}`, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
