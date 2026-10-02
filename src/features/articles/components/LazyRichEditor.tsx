import { lazy } from 'react'

export const RichEditor = lazy(() => import('./RichEditor').then(module => ({ default: module.RichEditor })))
