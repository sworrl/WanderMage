import { useState, useEffect } from 'react'
import { useTheme, themes, ThemeName } from '../contexts/ThemeContext'
import { getCurrentHoliday } from './HolidayEffects'
import Icon from './Icon'
import { safeStorage } from '../utils/storage'
import './QuickSettings.css'

// Holiday-specific icons - match the emojis from HolidayEffects.tsx
const holidayIcons: Record<string, string> = {
  'New Year': '',
  "New Year's Eve": '',
  'MLK Day': '',
  "Valentine's Day": '',
  "Presidents' Day": '',
  "St. Patrick's Day": '',
  'Easter': '',
  'Memorial Day': '',
  'Independence Day': '',
  'Labor Day': '',
  'Halloween': '',
  'Veterans Day': '',
  'Thanksgiving': '',
  'Christmas': '',
}

export default function QuickSettings() {
  const { themeName, setTheme } = useTheme()
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [holidayEnabled, setHolidayEnabled] = useState(() => {
    const saved = safeStorage.getItem('holidayEffectsEnabled')
    return saved !== 'false'
  })
  const currentHoliday = getCurrentHoliday()

  // Save holiday preference
  useEffect(() => {
    safeStorage.setItem('holidayEffectsEnabled', holidayEnabled.toString())
    // Dispatch event so App.tsx can update
    window.dispatchEvent(new CustomEvent('holidayToggle', { detail: holidayEnabled }))
  }, [holidayEnabled])

  const themeIcons: Record<ThemeName, string> = {
    midnight: '',
    ocean: '',
    forest: '',
    sunset: '',
    desert: '',
    light: '',
    crimson: '',
    nord: '',
    vampire: '',
    synthwave: '',
    matrix: '',
    dracula: '',
    monokai: '',
    cobalt: '',
    gruvbox: '',
    solarized: ''
  }

  return (
    <div className="quick-settings">
      {/* Holiday Toggle - only during active holidays */}
      {currentHoliday && (
        <div className="quick-setting-item">
          <button
            className={`quick-setting-btn holiday-btn ${holidayEnabled ? 'on' : 'off'}`}
            onClick={() => setHolidayEnabled(!holidayEnabled)}
            title={`${holidayEnabled ? 'Disable' : 'Enable'} ${currentHoliday.name} effects`}
          >
            <span className="setting-icon">
              <Icon name="star" size={18} />
            </span>
          </button>
        </div>
      )}

      {/* Theme Switcher */}
      <div className="quick-setting-item">
        <button
          className="quick-setting-btn"
          onClick={() => setShowThemeMenu(!showThemeMenu)}
          title="Change Theme"
        >
          <span className="setting-icon" style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: themes[themeName].colors.accentPrimary }} />
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
                  <span className="theme-icon" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: themes[name].colors.accentPrimary }} />
                  <span className="theme-label">{themes[name].displayName}</span>
                  {themeName === name && <span className="check-mark"><Icon name="check" size={14} /></span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
