import { useTheme, themes, ThemeName } from '../contexts/ThemeContext';
import './ThemeSelector.css';

export default function ThemeSelector() {
  const { themeName, setTheme } = useTheme();

  const themePreview: Record<ThemeName, { emoji: string; description: string }> = {
    midnight: { emoji: '', description: 'Deep dark with purple accents' },
    ocean: { emoji: '', description: 'Blue depths and calm waves' },
    forest: { emoji: '', description: 'Natural greens and earth tones' },
    sunset: { emoji: '', description: 'Warm oranges and amber hues' },
    desert: { emoji: '', description: 'Sandy browns and sunset gold' },
    light: { emoji: '', description: 'Bright and clean interface' },
    crimson: { emoji: '', description: 'Dark crimson with red accents' },
    nord: { emoji: '', description: 'Cool arctic blues and grays' },
    vampire: { emoji: '', description: 'Dark purple with mystical vibes' },
    synthwave: { emoji: '', description: 'Retro pink and cyan neon' },
    matrix: { emoji: '', description: 'Green on black hacker style' },
    dracula: { emoji: '', description: 'Purple and pink dark theme' },
    monokai: { emoji: '', description: 'Yellow and green code style' },
    cobalt: { emoji: '', description: 'Deep blue with bright accents' },
    gruvbox: { emoji: '', description: 'Warm retro browns and oranges' },
    solarized: { emoji: '', description: 'Classic beige and blue theme' },
  };

  return (
    <div className="theme-selector">
      <h3>Choose Theme</h3>
      <p className="theme-selector-subtitle">Select a visual theme for your interface</p>

      <div className="theme-grid">
        {(Object.keys(themes) as ThemeName[]).map((name) => {
          const theme = themes[name];
          const preview = themePreview[name];
          const isActive = themeName === name;

          return (
            <button
              key={name}
              className={`theme-card ${isActive ? 'active' : ''}`}
              onClick={() => setTheme(name)}
              style={{
                borderColor: isActive ? theme.colors.accentPrimary : 'transparent',
              }}
            >
              <div
                className="theme-preview"
                style={{
                  background: theme.colors.bgPrimary,
                  backgroundImage: theme.texture,
                  backgroundSize: '20px 20px',
                }}
              >
                <div className="theme-preview-content">
                  <div
                    className="theme-preview-accent"
                    style={{ backgroundColor: theme.colors.accentPrimary }}
                  />
                  <div
                    className="theme-preview-card"
                    style={{
                      backgroundColor: theme.colors.cardBg,
                      borderColor: theme.colors.borderColor,
                    }}
                  >
                    <div
                      className="theme-preview-text"
                      style={{ color: theme.colors.textPrimary }}
                    />
                    <div
                      className="theme-preview-text small"
                      style={{ color: theme.colors.textMuted }}
                    />
                  </div>
                </div>
              </div>

              <div className="theme-info">
                <span className="theme-emoji">{preview.emoji}</span>
                <span className="theme-name">{theme.displayName}</span>
                <span className="theme-description">{preview.description}</span>
                {isActive && <span className="theme-active-badge">Active</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
