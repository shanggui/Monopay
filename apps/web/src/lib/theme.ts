export type ThemeId = 'cobalt' | 'oats' | 'graphite' | 'lilac' | 'salt' | 'coffee'

export interface ThemeOption {
  id: ThemeId
  label: string
  swatch: string
  paper: string
}

export const THEME_STORAGE_KEY = 'monopay-theme'

export const themes: ThemeOption[] = [
  { id: 'cobalt', label: '奶油与钴蓝', swatch: '#2563EB', paper: '#FAF6EE' },
  { id: 'oats', label: '燕麦与松绿', swatch: '#2F6B4F', paper: '#F4F0E6' },
  { id: 'graphite', label: '石墨与橘', swatch: '#EA580C', paper: '#F5F5F4' },
  { id: 'lilac', label: '雾紫与柠檬', swatch: '#6D4AFF', paper: '#F3EFFF' },
  { id: 'salt', label: '海盐与番茄', swatch: '#1D4ED8', paper: '#F4F7FA' },
  { id: 'coffee', label: '咖啡与电光青', swatch: '#B8F24A', paper: '#191614' },
]

function isThemeId(value: string | null): value is ThemeId {
  return themes.some((theme) => theme.id === value)
}

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeId(saved) ? saved : 'cobalt'
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'coffee' ? '#191614' : '#FAF6EE')
  }
}

export function initTheme(): ThemeId {
  const theme = loadTheme()
  applyTheme(theme)
  return theme
}
