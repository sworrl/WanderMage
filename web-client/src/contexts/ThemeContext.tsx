import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { preferences as preferencesApi } from '../services/api';
import { safeStorage } from '../utils/storage';

export type ThemeName = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'light' | 'desert' | 'crimson' | 'nord' | 'vampire' | 'synthwave' | 'matrix' | 'dracula' | 'monokai' | 'cobalt' | 'gruvbox' | 'solarized';

export interface Theme {
  name: ThemeName;
  displayName: string;
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    borderColor: string;
    borderColorHover: string;
    shadow: string;
    shadowLg: string;
    accentPrimary: string;
    accentPrimaryHover: string;
    accentSecondary: string;
    accentSecondaryHover: string;
    accentDanger: string;
    accentDangerHover: string;
    accentSuccess: string;
    accentWarning: string;
    inputBg: string;
    cardBg: string;
  };
  texture: string;
}

export const themes: Record<ThemeName, Theme> = {
  midnight: {
    name: 'midnight',
    displayName: 'Midnight',
    colors: {
      bgPrimary: '#0a0a0f',
      bgSecondary: '#12121a',
      bgTertiary: '#1a1a24',
      textPrimary: '#e8e8f0',
      textSecondary: '#d0d0dc',
      textTertiary: '#b8b8c8',
      textMuted: '#8888a0',
      borderColor: '#2a2a38',
      borderColorHover: '#5865f2',
      shadow: 'rgba(0, 0, 0, 0.5)',
      shadowLg: 'rgba(0, 0, 0, 0.7)',
      accentPrimary: '#5865f2',
      accentPrimaryHover: '#4752c4',
      accentSecondary: '#6b6b88',
      accentSecondaryHover: '#52526a',
      accentDanger: '#ed4245',
      accentDangerHover: '#c73539',
      accentSuccess: '#3ba55d',
      accentWarning: '#faa81a',
      inputBg: '#1a1a24',
      cardBg: '#15151f',
    },
    texture: 'repeating-linear-gradient(45deg, #0a0a0f 0px, #0a0a0f 20px, #0d0d14 20px, #0d0d14 40px), repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(88, 101, 242, 0.08) 20px, rgba(88, 101, 242, 0.08) 40px)',
  },
  ocean: {
    name: 'ocean',
    displayName: 'Ocean',
    colors: {
      bgPrimary: '#0a1628',
      bgSecondary: '#0f1f38',
      bgTertiary: '#152845',
      textPrimary: '#e0f2ff',
      textSecondary: '#c2e7ff',
      textTertiary: '#a4dcff',
      textMuted: '#6ba4cc',
      borderColor: '#1e3a5f',
      borderColorHover: '#3b82f6',
      shadow: 'rgba(0, 20, 40, 0.5)',
      shadowLg: 'rgba(0, 20, 40, 0.7)',
      accentPrimary: '#3b82f6',
      accentPrimaryHover: '#2563eb',
      accentSecondary: '#4a7fa0',
      accentSecondaryHover: '#366080',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#0f1f38',
      cardBg: '#0d1b30',
    },
    texture: 'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(14, 165, 233, 0.15) 0%, transparent 50%), repeating-linear-gradient(90deg, transparent 0px, rgba(59, 130, 246, 0.1) 1px, transparent 2px, transparent 30px)',
  },
  forest: {
    name: 'forest',
    displayName: 'Forest',
    colors: {
      bgPrimary: '#0a1410',
      bgSecondary: '#0f1e18',
      bgTertiary: '#152820',
      textPrimary: '#e0f0e8',
      textSecondary: '#c2dfd0',
      textTertiary: '#a4ceb8',
      textMuted: '#6b9d80',
      borderColor: '#1e3f2f',
      borderColorHover: '#10b981',
      shadow: 'rgba(0, 20, 10, 0.5)',
      shadowLg: 'rgba(0, 20, 10, 0.7)',
      accentPrimary: '#10b981',
      accentPrimaryHover: '#059669',
      accentSecondary: '#4a8f70',
      accentSecondaryHover: '#367055',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#0f1e18',
      cardBg: '#0c1914',
    },
    texture: 'repeating-linear-gradient(60deg, #0a1410 0px, #0a1410 15px, #0c1713 15px, #0c1713 30px), repeating-linear-gradient(120deg, transparent, transparent 15px, rgba(16, 185, 129, 0.08) 15px, rgba(16, 185, 129, 0.08) 30px)',
  },
  sunset: {
    name: 'sunset',
    displayName: 'Sunset',
    colors: {
      bgPrimary: '#1a0f0a',
      bgSecondary: '#2a1812',
      bgTertiary: '#3a221a',
      textPrimary: '#ffe8d0',
      textSecondary: '#ffd0b0',
      textTertiary: '#ffb890',
      textMuted: '#d08860',
      borderColor: '#4a3020',
      borderColorHover: '#f97316',
      shadow: 'rgba(26, 15, 10, 0.5)',
      shadowLg: 'rgba(26, 15, 10, 0.7)',
      accentPrimary: '#f97316',
      accentPrimaryHover: '#ea580c',
      accentSecondary: '#c56a40',
      accentSecondaryHover: '#a05030',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#fbbf24',
      inputBg: '#2a1812',
      cardBg: '#221410',
    },
    texture: 'radial-gradient(circle at 80% 20%, rgba(249, 115, 22, 0.15) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(234, 88, 12, 0.12) 0%, transparent 50%), repeating-linear-gradient(135deg, transparent 0px, rgba(249, 115, 22, 0.08) 20px, transparent 40px)',
  },
  desert: {
    name: 'desert',
    displayName: 'Desert',
    colors: {
      bgPrimary: '#1a160a',
      bgSecondary: '#2a2010',
      bgTertiary: '#3a2a18',
      textPrimary: '#f0e8d0',
      textSecondary: '#dfd0b0',
      textTertiary: '#ceb890',
      textMuted: '#9d8860',
      borderColor: '#4a3a20',
      borderColorHover: '#eab308',
      shadow: 'rgba(26, 22, 10, 0.5)',
      shadowLg: 'rgba(26, 22, 10, 0.7)',
      accentPrimary: '#eab308',
      accentPrimaryHover: '#ca8a04',
      accentSecondary: '#b59a40',
      accentSecondaryHover: '#957a30',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#2a2010',
      cardBg: '#221c10',
    },
    texture: 'repeating-linear-gradient(0deg, #1a160a 0px, #1a160a 10px, #1d1a0d 10px, #1d1a0d 20px), repeating-linear-gradient(90deg, transparent, transparent 15px, rgba(234, 179, 8, 0.08) 15px, rgba(234, 179, 8, 0.08) 30px)',
  },
  light: {
    name: 'light',
    displayName: 'Light',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f9fafb',
      bgTertiary: '#f3f4f6',
      textPrimary: '#111827',
      textSecondary: '#374151',
      textTertiary: '#6b7280',
      textMuted: '#9ca3af',
      borderColor: '#e5e7eb',
      borderColorHover: '#3b82f6',
      shadow: 'rgba(0, 0, 0, 0.1)',
      shadowLg: 'rgba(0, 0, 0, 0.15)',
      accentPrimary: '#3b82f6',
      accentPrimaryHover: '#2563eb',
      accentSecondary: '#6b7280',
      accentSecondaryHover: '#4b5563',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#10b981',
      accentWarning: '#f59e0b',
      inputBg: '#ffffff',
      cardBg: '#ffffff',
    },
    texture: 'repeating-linear-gradient(45deg, #ffffff 0px, #ffffff 20px, #fafafa 20px, #fafafa 40px)',
  },
  crimson: {
    name: 'crimson',
    displayName: 'Crimson',
    colors: {
      bgPrimary: '#120507',
      bgSecondary: '#1c0a0d',
      bgTertiary: '#260f13',
      textPrimary: '#ffe0e6',
      textSecondary: '#ffc2d0',
      textTertiary: '#ffa4ba',
      textMuted: '#cc7088',
      borderColor: '#3a1520',
      borderColorHover: '#dc2626',
      shadow: 'rgba(18, 5, 7, 0.6)',
      shadowLg: 'rgba(18, 5, 7, 0.8)',
      accentPrimary: '#dc2626',
      accentPrimaryHover: '#b91c1c',
      accentSecondary: '#a05060',
      accentSecondaryHover: '#803040',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#1c0a0d',
      cardBg: '#160709',
    },
    texture: 'radial-gradient(circle at 30% 30%, rgba(220, 38, 38, 0.15) 0%, transparent 50%), repeating-linear-gradient(90deg, #120507 0px, #120507 25px, #150609 25px, #150609 50px)',
  },
  nord: {
    name: 'nord',
    displayName: 'Nord',
    colors: {
      bgPrimary: '#2e3440',
      bgSecondary: '#3b4252',
      bgTertiary: '#434c5e',
      textPrimary: '#eceff4',
      textSecondary: '#e5e9f0',
      textTertiary: '#d8dee9',
      textMuted: '#4c566a',
      borderColor: '#4c566a',
      borderColorHover: '#88c0d0',
      shadow: 'rgba(46, 52, 64, 0.5)',
      shadowLg: 'rgba(46, 52, 64, 0.7)',
      accentPrimary: '#88c0d0',
      accentPrimaryHover: '#5e81ac',
      accentSecondary: '#81a1c1',
      accentSecondaryHover: '#5e81ac',
      accentDanger: '#bf616a',
      accentDangerHover: '#a54b57',
      accentSuccess: '#a3be8c',
      accentWarning: '#ebcb8b',
      inputBg: '#3b4252',
      cardBg: '#3b4252',
    },
    texture: 'repeating-linear-gradient(135deg, #2e3440 0px, #2e3440 20px, #323844 20px, #323844 40px), repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(136, 192, 208, 0.05) 20px, rgba(136, 192, 208, 0.05) 40px)',
  },
  vampire: {
    name: 'vampire',
    displayName: 'Vampire',
    colors: {
      bgPrimary: '#0d0712',
      bgSecondary: '#15101c',
      bgTertiary: '#1d1526',
      textPrimary: '#f0e0ff',
      textSecondary: '#d8c2f0',
      textTertiary: '#c0a4e0',
      textMuted: '#8860a0',
      borderColor: '#2a1f35',
      borderColorHover: '#a855f7',
      shadow: 'rgba(13, 7, 18, 0.6)',
      shadowLg: 'rgba(13, 7, 18, 0.8)',
      accentPrimary: '#a855f7',
      accentPrimaryHover: '#9333ea',
      accentSecondary: '#8060a0',
      accentSecondaryHover: '#604080',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#15101c',
      cardBg: '#110c16',
    },
    texture: 'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.1) 0%, transparent 50%), repeating-linear-gradient(60deg, #0d0712 0px, #0d0712 15px, #100a15 15px, #100a15 30px)',
  },
  synthwave: {
    name: 'synthwave',
    displayName: 'Synthwave',
    colors: {
      bgPrimary: '#0a0515',
      bgSecondary: '#120a20',
      bgTertiary: '#1a0f2b',
      textPrimary: '#ffe0ff',
      textSecondary: '#ffc2ff',
      textTertiary: '#ffa4ff',
      textMuted: '#d070d0',
      borderColor: '#2a1540',
      borderColorHover: '#ec4899',
      shadow: 'rgba(10, 5, 21, 0.6)',
      shadowLg: 'rgba(10, 5, 21, 0.8)',
      accentPrimary: '#ec4899',
      accentPrimaryHover: '#db2777',
      accentSecondary: '#06b6d4',
      accentSecondaryHover: '#0891b2',
      accentDanger: '#ef4444',
      accentDangerHover: '#dc2626',
      accentSuccess: '#22c55e',
      accentWarning: '#f59e0b',
      inputBg: '#120a20',
      cardBg: '#0e0718',
    },
    texture: 'repeating-linear-gradient(0deg, #0a0515 0px, #0a0515 2px, transparent 2px, transparent 4px), repeating-linear-gradient(90deg, #0a0515 0px, #0a0515 2px, transparent 2px, transparent 40px), linear-gradient(180deg, rgba(236, 72, 153, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)',
  },
  matrix: {
    name: 'matrix',
    displayName: 'Matrix',
    colors: {
      bgPrimary: '#000000',
      bgSecondary: '#0a0f0a',
      bgTertiary: '#0f140f',
      textPrimary: '#00ff00',
      textSecondary: '#00dd00',
      textTertiary: '#00bb00',
      textMuted: '#008800',
      borderColor: '#003300',
      borderColorHover: '#00ff00',
      shadow: 'rgba(0, 0, 0, 0.8)',
      shadowLg: 'rgba(0, 0, 0, 0.9)',
      accentPrimary: '#00ff00',
      accentPrimaryHover: '#00dd00',
      accentSecondary: '#00aa00',
      accentSecondaryHover: '#008800',
      accentDanger: '#ff0000',
      accentDangerHover: '#dd0000',
      accentSuccess: '#00ff00',
      accentWarning: '#ffff00',
      inputBg: '#0a0f0a',
      cardBg: '#050a05',
    },
    texture: 'repeating-linear-gradient(0deg, transparent 0px, rgba(0, 255, 0, 0.03) 1px, transparent 2px, transparent 4px), repeating-linear-gradient(90deg, #000000 0px, #000000 40px, #020502 40px, #020502 80px)',
  },
  dracula: {
    name: 'dracula',
    displayName: 'Dracula',
    colors: {
      bgPrimary: '#282a36',
      bgSecondary: '#21222c',
      bgTertiary: '#191a21',
      textPrimary: '#f8f8f2',
      textSecondary: '#f8f8f2',
      textTertiary: '#6272a4',
      textMuted: '#44475a',
      borderColor: '#44475a',
      borderColorHover: '#bd93f9',
      shadow: 'rgba(40, 42, 54, 0.5)',
      shadowLg: 'rgba(40, 42, 54, 0.7)',
      accentPrimary: '#bd93f9',
      accentPrimaryHover: '#a77ee6',
      accentSecondary: '#ff79c6',
      accentSecondaryHover: '#ff5cb3',
      accentDanger: '#ff5555',
      accentDangerHover: '#ff3838',
      accentSuccess: '#50fa7b',
      accentWarning: '#f1fa8c',
      inputBg: '#21222c',
      cardBg: '#21222c',
    },
    texture: 'repeating-linear-gradient(45deg, #282a36 0px, #282a36 25px, #2a2c38 25px, #2a2c38 50px)',
  },
  monokai: {
    name: 'monokai',
    displayName: 'Monokai',
    colors: {
      bgPrimary: '#272822',
      bgSecondary: '#1e1f1c',
      bgTertiary: '#34352f',
      textPrimary: '#f8f8f2',
      textSecondary: '#f8f8f2',
      textTertiary: '#75715e',
      textMuted: '#75715e',
      borderColor: '#49483e',
      borderColorHover: '#66d9ef',
      shadow: 'rgba(39, 40, 34, 0.5)',
      shadowLg: 'rgba(39, 40, 34, 0.7)',
      accentPrimary: '#66d9ef',
      accentPrimaryHover: '#4dc0d9',
      accentSecondary: '#a6e22e',
      accentSecondaryHover: '#8fce1b',
      accentDanger: '#f92672',
      accentDangerHover: '#e00d5f',
      accentSuccess: '#a6e22e',
      accentWarning: '#e6db74',
      inputBg: '#1e1f1c',
      cardBg: '#1e1f1c',
    },
    texture: 'repeating-linear-gradient(90deg, #272822 0px, #272822 30px, #2a2b26 30px, #2a2b26 60px)',
  },
  cobalt: {
    name: 'cobalt',
    displayName: 'Cobalt',
    colors: {
      bgPrimary: '#002240',
      bgSecondary: '#001a30',
      bgTertiary: '#003050',
      textPrimary: '#ffffff',
      textSecondary: '#e0f0ff',
      textTertiary: '#c0d8f0',
      textMuted: '#7090b0',
      borderColor: '#003a60',
      borderColorHover: '#0088ff',
      shadow: 'rgba(0, 34, 64, 0.5)',
      shadowLg: 'rgba(0, 34, 64, 0.7)',
      accentPrimary: '#0088ff',
      accentPrimaryHover: '#0070dd',
      accentSecondary: '#ffbc00',
      accentSecondaryHover: '#dd9d00',
      accentDanger: '#ff3838',
      accentDangerHover: '#dd2020',
      accentSuccess: '#00ff00',
      accentWarning: '#ffbc00',
      inputBg: '#001a30',
      cardBg: '#001630',
    },
    texture: 'repeating-linear-gradient(135deg, #002240 0px, #002240 20px, #002845 20px, #002845 40px), repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(0, 136, 255, 0.05) 20px, rgba(0, 136, 255, 0.05) 40px)',
  },
  gruvbox: {
    name: 'gruvbox',
    displayName: 'Gruvbox',
    colors: {
      bgPrimary: '#282828',
      bgSecondary: '#1d2021',
      bgTertiary: '#3c3836',
      textPrimary: '#ebdbb2',
      textSecondary: '#d5c4a1',
      textTertiary: '#bdae93',
      textMuted: '#a89984',
      borderColor: '#504945',
      borderColorHover: '#fabd2f',
      shadow: 'rgba(40, 40, 40, 0.5)',
      shadowLg: 'rgba(40, 40, 40, 0.7)',
      accentPrimary: '#fabd2f',
      accentPrimaryHover: '#d79921',
      accentSecondary: '#83a598',
      accentSecondaryHover: '#458588',
      accentDanger: '#fb4934',
      accentDangerHover: '#cc2412',
      accentSuccess: '#b8bb26',
      accentWarning: '#fe8019',
      inputBg: '#1d2021',
      cardBg: '#1d2021',
    },
    texture: 'repeating-linear-gradient(45deg, #282828 0px, #282828 25px, #2a2a2a 25px, #2a2a2a 50px)',
  },
  solarized: {
    name: 'solarized',
    displayName: 'Solarized',
    colors: {
      bgPrimary: '#002b36',
      bgSecondary: '#073642',
      bgTertiary: '#586e75',
      textPrimary: '#fdf6e3',
      textSecondary: '#eee8d5',
      textTertiary: '#93a1a1',
      textMuted: '#657b83',
      borderColor: '#073642',
      borderColorHover: '#268bd2',
      shadow: 'rgba(0, 43, 54, 0.5)',
      shadowLg: 'rgba(0, 43, 54, 0.7)',
      accentPrimary: '#268bd2',
      accentPrimaryHover: '#2075b8',
      accentSecondary: '#859900',
      accentSecondaryHover: '#6c7d00',
      accentDanger: '#dc322f',
      accentDangerHover: '#c02826',
      accentSuccess: '#859900',
      accentWarning: '#b58900',
      inputBg: '#073642',
      cardBg: '#073642',
    },
    texture: 'repeating-linear-gradient(90deg, #002b36 0px, #002b36 30px, #003340 30px, #003340 60px)',
  },
};

interface ThemeContextType {
  themeName: ThemeName;
  theme: Theme;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Load from localStorage first for instant theme (no flash)
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const localTheme = safeStorage.getItem('wandermage_theme') as ThemeName;
    return (localTheme && themes[localTheme]) ? localTheme : 'midnight';
  });

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const response = await preferencesApi.get();
        const savedTheme = response.data.preferences?.theme;
        if (savedTheme && themes[savedTheme]) {
          setThemeName(savedTheme);
          // Sync localStorage with API
          safeStorage.setItem('wandermage_theme', savedTheme);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (newThemeName: ThemeName) => {
    setThemeName(newThemeName);
    // Save to localStorage for instant loading on next visit
    safeStorage.setItem('wandermage_theme', newThemeName);
    try {
      await preferencesApi.save('theme', newThemeName);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const theme = themes[themeName];

  useEffect(() => {
    const root = document.documentElement;

    // Set all color CSS variables
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(cssVarName, value);
    });

    // Set texture
    root.style.setProperty('--theme-texture', theme.texture);

    // Set body class for theme-specific styles
    document.body.className = `theme-${theme.name}`;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ themeName, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
