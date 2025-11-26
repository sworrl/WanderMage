import { useState } from 'react'
import { useTheme, themes, ThemeName } from '../contexts/ThemeContext'
import './QuickSettings.css'

export default function QuickSettings() {
  const { themeName, setTheme } = useTheme()
  const [showThemeMenu, setShowThemeMenu] = useState(false)

  const themeIcons: Record<ThemeName, string> = {
    midnight: '🌙',
    ocean: '🌊',
    forest: '🌲',
    sunset: '🌅',
    desert: '🏜️',
    light: '☀️',
    crimson: '🔴',
    nord: '❄️',
    vampire: '🧛',
    synthwave: '🌃',
    matrix: '💚',
    dracula: '🦇',
    monokai: '🟡',
    cobalt: '💙',
    gruvbox: '🟤',
    solarized: '🌞'
  }

  return (
    <div className="quick-settings">
      {/* Theme Switcher */}
      <div className="quick-setting-item">
        <button
          className="quick-setting-btn"
          onClick={() => setShowThemeMenu(!showThemeMenu)}
          title="Change Theme"
        >
          <span className="setting-icon">{themeIcons[themeName]}</span>
        </button>

        {showThemeMenu && (
          <>
            <div className="quick-setting-overlay" onClick={() => setShowThemeMenu(false)} />
            <div className="theme-quick-menu">
              {(Object.keys(themes) as ThemeName[]).map((name) => (
                <button
                  key={name}
                  className={`theme-quick-option ${themeName === name ? 'active' : ''}`}
                  onClick={() => {
                    setTheme(name)
                    setShowThemeMenu(false)
                  }}
                >
                  <span className="theme-icon">{themeIcons[name]}</span>
                  <span className="theme-label">{themes[name].displayName}</span>
                  {themeName === name && <span className="check-mark">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
