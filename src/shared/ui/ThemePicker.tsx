import { setTheme, useThemePreference, type ThemePreference } from '../lib/theme'

export function ThemePicker() {
  const theme = useThemePreference()
  return (
    <label className="theme-picker">
      主题
      <select
        aria-label="管理台主题"
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemePreference)}
      >
        <option value="warm">暖灰</option>
        <option value="dark">深色</option>
        <option value="system">跟随系统</option>
      </select>
    </label>
  )
}
