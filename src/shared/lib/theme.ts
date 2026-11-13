import { useSyncExternalStore } from 'react'

export type ThemePreference = 'warm' | 'dark' | 'system'
const storageKey = 'raychi.theme'
let preference: ThemePreference = 'warm'
const listeners = new Set<() => void>()
let initialized = false

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(storageKey)
    if (value === 'warm' || value === 'dark' || value === 'system') return value
  } catch {
    /* A blocked store leaves the preference in memory. */
  }
  return 'warm'
}
function apply() {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'warm'
  document.documentElement.classList.toggle('dark-theme', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
export function initializeTheme() {
  if (initialized) return
  initialized = true
  preference = readPreference()
  apply()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return
    preference = readPreference()
    apply()
    listeners.forEach((listener) => listener())
  })
}
export function setTheme(value: ThemePreference) {
  preference = value
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    /* Session-only preference. */
  }
  apply()
  listeners.forEach((listener) => listener())
}
export function useThemePreference() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => preference,
  )
}
