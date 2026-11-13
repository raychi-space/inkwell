import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { readViewState, writeViewState } from '../api/sessionCache'

/** Persist navigation controls only; never register editor content, passwords or secrets. */
export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readViewState(key, initial))
  const remember = useCallback<Dispatch<SetStateAction<T>>>(
    (next) =>
      setValue((previous) => {
        const result = typeof next === 'function' ? (next as (value: T) => T)(previous) : next
        writeViewState(key, result)
        return result
      }),
    [key],
  )
  return [value, remember]
}
