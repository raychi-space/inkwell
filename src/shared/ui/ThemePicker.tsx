import { setTheme, useThemePreference, type ThemePreference } from '../lib/theme'
import { Moon, Sun, Monitor } from 'lucide-react'
import { Select } from './Select'

const options = [
  { value: 'warm', label: '暖灰', icon: <Sun size={18} aria-hidden="true" /> },
  { value: 'dark', label: '深色', icon: <Moon size={18} aria-hidden="true" /> },
  { value: 'system', label: '跟随系统', icon: <Monitor size={18} aria-hidden="true" /> },
]

export function ThemePicker() {
  const theme = useThemePreference()
  return (
    <div className="theme-picker">
      <Select
        label="管理台主题"
        value={theme}
        options={options}
        floating
        onChange={(value) => setTheme(value as ThemePreference)}
      />
    </div>
  )
}
